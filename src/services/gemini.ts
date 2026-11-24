import { CategoryConfig, DEFAULT_GEMINI_MODEL, TaskBucket, TaskItem } from '../types/models';

export interface ParsedCompletedActivity {
  title: string;
  category: string;
  matchedOpenTaskId: string | null;
}

export interface ParsedUnfinishedTask {
  title: string;
  suggestedBucket: TaskBucket;
  category: string;
}

export interface BrainDumpAnalysisResult {
  completedActivities: ParsedCompletedActivity[];
  unfinishedTasks: ParsedUnfinishedTask[];
}

export interface BrainDumpRequestOptions {
  apiKey: string;
  model?: string;
  rawText: string;
  categories: CategoryConfig[];
  openTasks: Pick<TaskItem, 'id' | 'title' | 'bucket'>[];
  dateKey: string;
  fetchImpl?: typeof fetch;
}

export function buildBrainDumpResponseSchema(categoryNames: string[]) {
  const safeCategories = categoryNames.length > 0 ? categoryNames : ['Personal'];

  return {
    type: 'OBJECT',
    properties: {
      completedActivities: {
        type: 'ARRAY',
        description:
          'Distinct activities the user actually completed, cleaned into concise, natural action statements.',
        items: {
          type: 'OBJECT',
          properties: {
            title: {
              type: 'STRING',
              description: 'Concise, clear description of one completed activity.',
            },
            category: {
              type: 'STRING',
              enum: safeCategories,
              description: 'Best matching category from the allowed list.',
            },
            matchedOpenTaskId: {
              type: 'STRING',
              nullable: true,
              description:
                'Exact id from the provided OPEN_TASKS list if this activity clearly completes that open task; otherwise null.',
            },
          },
          required: ['title', 'category'],
        },
      },
      unfinishedTasks: {
        type: 'ARRAY',
        description:
          'Items the user explicitly mentioned NOT finishing, deferring, or needing to follow up on later.',
        items: {
          type: 'OBJECT',
          properties: {
            title: {
              type: 'STRING',
              description: 'Actionable, concise task title.',
            },
            suggestedBucket: {
              type: 'STRING',
              enum: ['today', 'later'],
              description: 'Use "today" for urgent/tomorrow follow-ups, "later" for general backlog.',
            },
            category: {
              type: 'STRING',
              enum: safeCategories,
              description: 'Best matching category from the allowed list.',
            },
          },
          required: ['title', 'suggestedBucket', 'category'],
        },
      },
    },
    required: ['completedActivities', 'unfinishedTasks'],
  };
}

export function buildBrainDumpPrompt(
  rawText: string,
  categoryNames: string[],
  openTasks: Pick<TaskItem, 'id' | 'title' | 'bucket'>[],
  dateKey: string
): string {
  const openTasksContext =
    openTasks.length > 0
      ? openTasks.map((t) => `- id="${t.id}" [${t.bucket}]: ${t.title}`).join('\n')
      : '(none)';

  return [
    `You are Strike's personal daily log assistant organizing a user's messy brain dump for ${dateKey}.`,
    'Rules:',
    '1. Split the text into distinct, concise completed activities (sentence case, no trailing period, clear action verb when natural).',
    `2. Assign EVERY item strictly one category from: ${categoryNames.join(', ')}.`,
    '3. If a completed activity clearly completes one of the OPEN_TASKS below, set matchedOpenTaskId to its exact id; otherwise set matchedOpenTaskId to null.',
    '4. If the user mentions something unfinished, skipped, blocked, or to do tomorrow/next, extract it into unfinishedTasks (do NOT duplicate items already in OPEN_TASKS).',
    '5. Do not invent activities the user did not mention.',
    '',
    'OPEN_TASKS:',
    openTasksContext,
    '',
    'USER_BRAIN_DUMP:',
    rawText.trim(),
  ].join('\n');
}

export function parseGeminiBrainDumpPayload(
  jsonText: string,
  allowedCategories: string[],
  validOpenTaskIds: Set<string>
): BrainDumpAnalysisResult {
  const fallbackCategory = allowedCategories[0] ?? 'Personal';
  const cleanedJson = jsonText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');

  const parsed = JSON.parse(cleanedJson) as Partial<BrainDumpAnalysisResult>;

  const completedActivities: ParsedCompletedActivity[] = Array.isArray(parsed.completedActivities)
    ? parsed.completedActivities
        .filter((item): item is ParsedCompletedActivity => Boolean(item && typeof item.title === 'string' && item.title.trim()))
        .map((item) => ({
          title: item.title.trim(),
          category: allowedCategories.includes(item.category) ? item.category : fallbackCategory,
          matchedOpenTaskId:
            typeof item.matchedOpenTaskId === 'string' && validOpenTaskIds.has(item.matchedOpenTaskId)
              ? item.matchedOpenTaskId
              : null,
        }))
    : [];

  const unfinishedTasks: ParsedUnfinishedTask[] = Array.isArray(parsed.unfinishedTasks)
    ? parsed.unfinishedTasks
        .filter((item): item is ParsedUnfinishedTask => Boolean(item && typeof item.title === 'string' && item.title.trim()))
        .map((item) => ({
          title: item.title.trim(),
          suggestedBucket: item.suggestedBucket === 'later' ? 'later' : 'today',
          category: allowedCategories.includes(item.category) ? item.category : fallbackCategory,
        }))
    : [];

  return { completedActivities, unfinishedTasks };
}

export async function analyzeBrainDumpWithGemini(
  options: BrainDumpRequestOptions
): Promise<BrainDumpAnalysisResult> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new Error('Add your Gemini API key in Settings to auto-categorize your daily dump.');
  }

  const trimmedText = options.rawText.trim();
  if (!trimmedText) {
    throw new Error('Write a quick note about what you did first.');
  }

  const model = (options.model || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
  const categoryNames =
    options.categories.length > 0 ? options.categories.map((c) => c.name) : ['Personal'];
  const schema = buildBrainDumpResponseSchema(categoryNames);
  const prompt = buildBrainDumpPrompt(trimmedText, categoryNames, options.openTasks, options.dateKey);
  const fetchFn = options.fetchImpl ?? fetch;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetchFn(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    }),
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errBody = (await response.json()) as { error?: { message?: string } };
      if (errBody?.error?.message) {
        errorDetail = errBody.error.message;
      }
    } catch {
      // Fall back to status code message
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Gemini API key rejected (${errorDetail}). Check your key in Settings.`);
    }
    if (response.status === 404) {
      throw new Error(`Gemini model "${model}" was not found (${errorDetail}). Check your model setting.`);
    }
    if (response.status === 429) {
      throw new Error(`Gemini rate limit reached (${errorDetail}). Please try again in a moment.`);
    }
    throw new Error(`Gemini request failed: ${errorDetail}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const textPart = data.candidates?.[0]?.content?.parts?.find((p) => typeof p.text === 'string')?.text;
  if (!textPart) {
    throw new Error('Gemini returned an empty response. Please try again.');
  }

  const validOpenIds = new Set(options.openTasks.map((t) => t.id));
  return parseGeminiBrainDumpPayload(textPart, categoryNames, validOpenIds);
}

export async function testGeminiConnection(
  apiKey: string,
  model: string = DEFAULT_GEMINI_MODEL,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const cleanKey = apiKey.trim();
  const cleanModel = model.trim() || DEFAULT_GEMINI_MODEL;

  if (!cleanKey) {
    throw new Error('Enter a Gemini API key first.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    cleanModel
  )}:generateContent?key=${encodeURIComponent(cleanKey)}`;

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }],
      generationConfig: { maxOutputTokens: 8, temperature: 0 },
    }),
  });

  if (!response.ok) {
    let msg = `HTTP ${response.status}`;
    try {
      const errBody = (await response.json()) as { error?: { message?: string } };
      if (errBody?.error?.message) msg = errBody.error.message;
    } catch {
      // ignore parse failure
    }
    throw new Error(msg);
  }

  return `Connected to ${cleanModel}`;
}
