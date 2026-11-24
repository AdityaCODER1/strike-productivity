import {
  NcertChapter,
  StudySubjectId,
  buildCompactCatalogPrompt,
  getActiveChapters,
  getChapterById,
  getSubjectMeta,
  isDoubtsCategoryName,
  isStudyTaggedCategory,
  isValidSubjectId,
} from '../data/ncertCatalog';
import { CategoryConfig, DEFAULT_GEMINI_MODEL, TaskBucket, TaskItem } from '../types/models';
import { splitDataUrl } from '../utils/imageCompression';

export interface ParsedCompletedActivity {
  title: string;
  category: string;
  matchedOpenTaskId: string | null;
  subjectId?: StudySubjectId;
  chapterId?: string;
}

export interface ParsedUnfinishedTask {
  title: string;
  suggestedBucket: TaskBucket;
  category: string;
  subjectId?: StudySubjectId;
  chapterId?: string;
}

export interface ParsedBrainDumpDoubt {
  title: string;
  questionText: string;
  subjectId: StudySubjectId;
  chapterId: string;
  pyqYear: number | null;
}

export interface BrainDumpAnalysisResult {
  completedActivities: ParsedCompletedActivity[];
  unfinishedTasks: ParsedUnfinishedTask[];
  doubts: ParsedBrainDumpDoubt[];
}

export interface BrainDumpRequestOptions {
  apiKey: string;
  model?: string;
  rawText: string;
  categories: CategoryConfig[];
  openTasks: Pick<TaskItem, 'id' | 'title' | 'bucket'>[];
  dateKey: string;
  includeArchivedNcert?: boolean;
  fetchImpl?: typeof fetch;
}

export interface StudyClassificationResult {
  subjectId: StudySubjectId | null;
  chapterId: string | null;
}

export interface ChapterCoverageEvaluationResult {
  coveragePercent: number;
  aiSummary: string;
}

export interface PyqImageExtractionResult {
  title: string;
  questionText: string;
  subjectId: StudySubjectId;
  chapterId: string;
  pyqYear: number | null;
  hasVisualDiagram: boolean;
}

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

const SUBJECT_ENUM: StudySubjectId[] = ['physics', 'chemistry', 'biology'];

function cleanModelJson(jsonText: string): string {
  return jsonText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
}

async function callGeminiGenerateContent(options: {
  apiKey: string;
  model?: string;
  parts: GeminiPart[];
  temperature?: number;
  maxOutputTokens?: number;
  responseSchema?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) {
    throw new Error('Add your Gemini API key in Settings to use AI features.');
  }

  const model = (options.model || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
  const fetchFn = options.fetchImpl ?? fetch;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const generationConfig: Record<string, unknown> = {
    temperature: options.temperature ?? 0.2,
  };
  if (options.maxOutputTokens !== undefined) {
    generationConfig.maxOutputTokens = options.maxOutputTokens;
  }
  if (options.responseSchema) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = options.responseSchema;
  }

  const response = await fetchFn(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: options.parts }],
      generationConfig,
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

  return textPart;
}

function resolveStudyLink(
  category: string,
  rawSubjectId: unknown,
  rawChapterId: unknown
): { subjectId?: StudySubjectId; chapterId?: string } {
  if (!isStudyTaggedCategory(category)) {
    return {};
  }
  const chapter = typeof rawChapterId === 'string' ? getChapterById(rawChapterId.trim()) : undefined;
  if (chapter) {
    return { subjectId: chapter.subjectId, chapterId: chapter.id };
  }
  if (isValidSubjectId(rawSubjectId)) {
    return { subjectId: rawSubjectId };
  }
  return {};
}

export function buildBrainDumpResponseSchema(
  categoryNames: string[],
  includeArchivedNcert: boolean = false
) {
  const safeCategories = categoryNames.length > 0 ? categoryNames : ['Personal'];
  const activeChapterIds = getActiveChapters(includeArchivedNcert).map((c) => c.id);

  const nullableStudyFields = {
    subjectId: {
      type: 'STRING',
      nullable: true,
      enum: SUBJECT_ENUM,
      description:
        'Only set for Learning or Doubts items matching Physics, Chemistry, or Biology; MUST be null for all other categories.',
    },
    chapterId: {
      type: 'STRING',
      nullable: true,
      enum: activeChapterIds,
      description:
        'Exact NCERT chapter id from NCERT_CATALOG only when category is Learning or Doubts; MUST be null for non-study items or if unclear.',
    },
  };

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
            ...nullableStudyFields,
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
            ...nullableStudyFields,
          },
          required: ['title', 'suggestedBucket', 'category'],
        },
      },
      doubts: {
        type: 'ARRAY',
        description:
          'Explicit study doubts, confusions, or tricky Physics/Chemistry/Biology questions the user mentioned wanting to review later.',
        items: {
          type: 'OBJECT',
          properties: {
            title: {
              type: 'STRING',
              description: 'Short clear summary of the doubt (max 90 chars).',
            },
            questionText: {
              type: 'STRING',
              description: 'Full description of the doubt or question to review.',
            },
            subjectId: {
              type: 'STRING',
              enum: SUBJECT_ENUM,
              description: 'PCB subject for this doubt.',
            },
            chapterId: {
              type: 'STRING',
              enum: activeChapterIds,
              description: 'Best matching NCERT chapter id from NCERT_CATALOG.',
            },
            pyqYear: {
              type: 'INTEGER',
              nullable: true,
              description: '4-digit exam year if the user mentioned a specific PYQ year; otherwise null.',
            },
          },
          required: ['title', 'questionText', 'subjectId', 'chapterId'],
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
  dateKey: string,
  includeArchivedNcert: boolean = false
): string {
  const openTasksContext =
    openTasks.length > 0
      ? openTasks.map((t) => `- id="${t.id}" [${t.bucket}]: ${t.title}`).join('\n')
      : '(none)';

  return [
    `You are Strike's personal daily log & NCERT PCB study assistant organizing a user's brain dump for ${dateKey}.`,
    'Rules:',
    '1. Split the text into distinct, concise completed activities (sentence case, no trailing period, clear action verb when natural).',
    `2. Assign EVERY item strictly one category from: ${categoryNames.join(', ')}.`,
    '3. If a completed activity clearly completes one of the OPEN_TASKS below, set matchedOpenTaskId to its exact id; otherwise set matchedOpenTaskId to null.',
    '4. If the user mentions something unfinished, skipped, blocked, or to do tomorrow/next, extract it into unfinishedTasks (do NOT duplicate items already in OPEN_TASKS).',
    '5. For items categorized as "Learning" (or "Doubts") about Physics, Chemistry, or Biology, tag subjectId and exact chapterId from NCERT_CATALOG below. For ALL non-study categories (Work, Personal, Health, Home, Social, etc.), ALWAYS set subjectId=null and chapterId=null.',
    '6. If the user explicitly mentions a study doubt, confusion, or question they got stuck on and need to review later, extract it into the doubts array with the best matching subjectId and chapterId (and do not duplicate it as a completed Learning activity unless they also solved/studied something else).',
    '7. Do not invent activities or doubts the user did not mention.',
    '',
    'OPEN_TASKS:',
    openTasksContext,
    '',
    'NCERT_CATALOG (chapterId | subjectId | Class | Title):',
    buildCompactCatalogPrompt(includeArchivedNcert),
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
  const parsed = JSON.parse(cleanModelJson(jsonText)) as Partial<BrainDumpAnalysisResult>;

  const completedActivities: ParsedCompletedActivity[] = Array.isArray(parsed.completedActivities)
    ? parsed.completedActivities
        .filter((item): item is ParsedCompletedActivity =>
          Boolean(item && typeof item.title === 'string' && item.title.trim())
        )
        .map((item) => {
          const category = allowedCategories.includes(item.category)
            ? item.category
            : fallbackCategory;
          const studyLink = resolveStudyLink(category, item.subjectId, item.chapterId);
          return {
            title: item.title.trim(),
            category,
            matchedOpenTaskId:
              typeof item.matchedOpenTaskId === 'string' && validOpenTaskIds.has(item.matchedOpenTaskId)
                ? item.matchedOpenTaskId
                : null,
            ...studyLink,
          };
        })
    : [];

  const unfinishedTasks: ParsedUnfinishedTask[] = Array.isArray(parsed.unfinishedTasks)
    ? parsed.unfinishedTasks
        .filter((item): item is ParsedUnfinishedTask =>
          Boolean(item && typeof item.title === 'string' && item.title.trim())
        )
        .map((item) => {
          const category = allowedCategories.includes(item.category)
            ? item.category
            : fallbackCategory;
          const studyLink = resolveStudyLink(category, item.subjectId, item.chapterId);
          return {
            title: item.title.trim(),
            suggestedBucket: item.suggestedBucket === 'later' ? 'later' : 'today',
            category,
            ...studyLink,
          };
        })
    : [];

  const doubts: ParsedBrainDumpDoubt[] = Array.isArray(parsed.doubts)
    ? parsed.doubts
        .filter((item): item is ParsedBrainDumpDoubt =>
          Boolean(item && typeof item.title === 'string' && item.title.trim())
        )
        .map((item) => {
          const chap = getChapterById(item.chapterId);
          const subjectId: StudySubjectId =
            chap?.subjectId ?? (isValidSubjectId(item.subjectId) ? item.subjectId : 'physics');
          const fallbackChapter =
            chap?.id ?? getActiveChapters(false).find((c) => c.subjectId === subjectId)?.id ?? '';
          const pyqYear =
            typeof item.pyqYear === 'number' &&
            Number.isFinite(item.pyqYear) &&
            item.pyqYear >= 1988 &&
            item.pyqYear <= 2035
              ? Math.floor(item.pyqYear)
              : null;
          return {
            title: item.title.trim(),
            questionText:
              typeof item.questionText === 'string' && item.questionText.trim()
                ? item.questionText.trim()
                : item.title.trim(),
            subjectId,
            chapterId: fallbackChapter,
            pyqYear,
          };
        })
        .filter((d) => Boolean(d.chapterId))
    : [];

  // Also promote any completedActivities explicitly categorized as Doubts with valid chapter into doubts if not already captured
  for (const act of completedActivities) {
    if (
      isDoubtsCategoryName(act.category) &&
      act.subjectId &&
      act.chapterId &&
      !doubts.some((d) => d.title.toLowerCase() === act.title.toLowerCase())
    ) {
      doubts.push({
        title: act.title,
        questionText: act.title,
        subjectId: act.subjectId,
        chapterId: act.chapterId,
        pyqYear: null,
      });
    }
  }

  return { completedActivities, unfinishedTasks, doubts };
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

  const includeArchived = Boolean(options.includeArchivedNcert);
  const categoryNames =
    options.categories.length > 0 ? options.categories.map((c) => c.name) : ['Personal'];
  const schema = buildBrainDumpResponseSchema(categoryNames, includeArchived);
  const prompt = buildBrainDumpPrompt(
    trimmedText,
    categoryNames,
    options.openTasks,
    options.dateKey,
    includeArchived
  );

  const textPart = await callGeminiGenerateContent({
    apiKey,
    model: options.model,
    parts: [{ text: prompt }],
    temperature: 0.2,
    responseSchema: schema,
    fetchImpl: options.fetchImpl,
  });

  const validOpenIds = new Set(options.openTasks.map((t) => t.id));
  return parseGeminiBrainDumpPayload(textPart, categoryNames, validOpenIds);
}

/**
 * Classifies a single untagged Learning/Doubt text item into an NCERT PCB subject & chapter.
 */
export async function classifyStudyItemWithGemini(options: {
  apiKey: string;
  model?: string;
  text: string;
  includeArchivedNcert?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<StudyClassificationResult> {
  const includeArchived = Boolean(options.includeArchivedNcert);
  const activeChapterIds = getActiveChapters(includeArchived).map((c) => c.id);

  const schema = {
    type: 'OBJECT',
    properties: {
      subjectId: {
        type: 'STRING',
        nullable: true,
        enum: SUBJECT_ENUM,
      },
      chapterId: {
        type: 'STRING',
        nullable: true,
        enum: activeChapterIds,
      },
    },
  };

  const prompt = [
    'Map the following study activity to the single best matching NCERT Class 11/12 Physics, Chemistry, or Biology chapter.',
    'If the text is not clearly about one of the listed NCERT PCB chapters, return subjectId=null and chapterId=null.',
    '',
    'NCERT_CATALOG (chapterId | subjectId | Class | Title):',
    buildCompactCatalogPrompt(includeArchived),
    '',
    `STUDY_ACTIVITY: ${options.text.trim()}`,
  ].join('\n');

  const textPart = await callGeminiGenerateContent({
    apiKey: options.apiKey,
    model: options.model,
    parts: [{ text: prompt }],
    temperature: 0.1,
    responseSchema: schema,
    fetchImpl: options.fetchImpl,
  });

  const parsed = JSON.parse(cleanModelJson(textPart)) as {
    subjectId?: string | null;
    chapterId?: string | null;
  };
  const chap = getChapterById(parsed.chapterId);
  if (chap) {
    return { subjectId: chap.subjectId, chapterId: chap.id };
  }
  return {
    subjectId: isValidSubjectId(parsed.subjectId) ? parsed.subjectId : null,
    chapterId: null,
  };
}

/**
 * Holistic AI evaluation of meaningful NCERT chapter coverage (0–100%) based on
 * all completed logs and checked-off PYQ years for that chapter.
 */
export async function evaluateChapterCoverageWithGemini(options: {
  apiKey: string;
  model?: string;
  chapter: NcertChapter;
  completedLogs: Array<{ dateKey: string; title: string }>;
  completedPyqYears: number[];
  totalPyqYears: number;
  previousPercent?: number;
  fetchImpl?: typeof fetch;
}): Promise<ChapterCoverageEvaluationResult> {
  const subjectMeta = getSubjectMeta(options.chapter.subjectId);

  const schema = {
    type: 'OBJECT',
    properties: {
      coveragePercent: {
        type: 'INTEGER',
        description: 'Estimated meaningful chapter mastery/coverage percentage from 0 to 100.',
      },
      aiSummary: {
        type: 'STRING',
        description:
          'Concise 1–2 sentence note summarizing what is covered and what key NCERT/practice areas remain (max 180 chars).',
      },
    },
    required: ['coveragePercent', 'aiSummary'],
  };

  const logsText =
    options.completedLogs.length > 0
      ? options.completedLogs.map((l) => `- [${l.dateKey}] ${l.title}`).join('\n')
      : '(no study logs recorded yet)';

  const pyqLine = subjectMeta.hasPyqTracker
    ? `Checked-off PYQ years (${options.completedPyqYears.length}/${options.totalPyqYears}): ${
        options.completedPyqYears.length > 0
          ? [...options.completedPyqYears].sort((a, b) => b - a).join(', ')
          : 'none'
      }`
    : 'PYQ year tracker: not tracked separately for Biology';

  const prompt = [
    'You are an experienced NCERT Class 11/12 & NEET PCB mentor evaluating how much meaningful progress a student has made on a single NCERT chapter.',
    'Evaluate holistically against the full NCERT chapter scope:',
    '- Concept clarity / NCERT reading & notes (~35–40%)',
    '- Subtopic breadth, solved examples, NCERT back exercises / diagrams / reactions (~25–30%)',
    '- Question practice, PYQs, and revision (~30–35%)',
    'Be realistic and encouraging: a single lecture or short reading is typically 15–25%, full theory + notes ~45–55%, adding practice/NCERT exercises ~70–80%, adding thorough PYQs + revision ~90–100%. If there is no work and no PYQs, return 0.',
    '',
    `SUBJECT: ${subjectMeta.name}`,
    `CLASS: NCERT Class ${options.chapter.classLevel}`,
    `CHAPTER: ${options.chapter.title}`,
    `PREVIOUS_ESTIMATE: ${options.previousPercent ?? 0}%`,
    pyqLine,
    '',
    'COMPLETED_STUDY_LOGS:',
    logsText,
  ].join('\n');

  const textPart = await callGeminiGenerateContent({
    apiKey: options.apiKey,
    model: options.model,
    parts: [{ text: prompt }],
    temperature: 0.2,
    responseSchema: schema,
    fetchImpl: options.fetchImpl,
  });

  const parsed = JSON.parse(cleanModelJson(textPart)) as Partial<ChapterCoverageEvaluationResult>;
  const rawPct = Number(parsed.coveragePercent);
  const clamped = Number.isFinite(rawPct) ? Math.max(0, Math.min(100, Math.round(rawPct))) : 0;
  const summary =
    typeof parsed.aiSummary === 'string' && parsed.aiSummary.trim()
      ? parsed.aiSummary.trim()
      : clamped === 0
      ? 'Not started yet.'
      : 'Progress updated from your study logs.';

  return {
    coveragePercent: clamped,
    aiSummary: summary,
  };
}

/**
 * Gemini Vision OCR + NCERT chapter auto-detection for uploaded PYQ photos.
 */
export async function extractDoubtFromImageWithGemini(options: {
  apiKey: string;
  model?: string;
  imageBase64: string;
  imageMimeType: string;
  includeArchivedNcert?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<PyqImageExtractionResult> {
  const includeArchived = Boolean(options.includeArchivedNcert);
  const activeChapterIds = getActiveChapters(includeArchived).map((c) => c.id);

  const schema = {
    type: 'OBJECT',
    properties: {
      title: {
        type: 'STRING',
        description: 'Short descriptive label for this question (max 85 chars).',
      },
      questionText: {
        type: 'STRING',
        description:
          'Clean, faithful text transcription of the question, options (a/b/c/d if present), values, and math/chemistry notation using clear Unicode symbols (², ³, →, Δ, μ, Ω, etc.).',
      },
      subjectId: {
        type: 'STRING',
        enum: SUBJECT_ENUM,
        description: 'Detected PCB subject.',
      },
      chapterId: {
        type: 'STRING',
        enum: activeChapterIds,
        description: 'Best matching NCERT chapter id from NCERT_CATALOG.',
      },
      pyqYear: {
        type: 'INTEGER',
        nullable: true,
        description: '4-digit exam year visible in the image (e.g. [NEET 2021]); otherwise null.',
      },
      hasVisualDiagram: {
        type: 'BOOLEAN',
        description:
          'True if the question relies on a circuit, graph, ray diagram, biological diagram, or chemical structure that cannot be fully conveyed by text alone.',
      },
    },
    required: ['title', 'questionText', 'subjectId', 'chapterId', 'hasVisualDiagram'],
  };

  const prompt = [
    'Transcribe this Physics/Chemistry/Biology PYQ or textbook doubt image into clean text so the student can save space and review it later.',
    'Rules:',
    '1. Accurately transcribe the full question stem, given data, units, and options (if MCQ). Use readable Unicode math/chem symbols (e.g. x², H₂SO₄, →, ΔH, Ω, μF).',
    '2. Identify the exact NCERT subjectId and chapterId from NCERT_CATALOG below.',
    '3. If an exam year tag like "NEET 2022" or "AIPMT 2015" appears, extract the 4-digit year into pyqYear; else null.',
    '4. Set hasVisualDiagram=true if the image includes a circuit, graph, ray diagram, organic ring structure, or biological figure that is essential to solving the question.',
    '',
    'NCERT_CATALOG (chapterId | subjectId | Class | Title):',
    buildCompactCatalogPrompt(includeArchived),
  ].join('\n');

  const textPart = await callGeminiGenerateContent({
    apiKey: options.apiKey,
    model: options.model,
    parts: [
      { text: prompt },
      {
        inlineData: {
          mimeType: options.imageMimeType,
          data: options.imageBase64,
        },
      },
    ],
    temperature: 0.15,
    responseSchema: schema,
    fetchImpl: options.fetchImpl,
  });

  const parsed = JSON.parse(cleanModelJson(textPart)) as Partial<PyqImageExtractionResult>;
  const chap = getChapterById(parsed.chapterId);
  const subjectId: StudySubjectId =
    chap?.subjectId ?? (isValidSubjectId(parsed.subjectId) ? parsed.subjectId : 'physics');
  const chapterId =
    chap?.id ?? getActiveChapters(includeArchived).find((c) => c.subjectId === subjectId)?.id ?? '';
  const pyqYear =
    typeof parsed.pyqYear === 'number' &&
    Number.isFinite(parsed.pyqYear) &&
    parsed.pyqYear >= 1988 &&
    parsed.pyqYear <= 2035
      ? Math.floor(parsed.pyqYear)
      : null;

  const questionText =
    typeof parsed.questionText === 'string' && parsed.questionText.trim()
      ? parsed.questionText.trim()
      : 'PYQ Doubt';
  const title =
    typeof parsed.title === 'string' && parsed.title.trim()
      ? parsed.title.trim()
      : questionText.slice(0, 72);

  return {
    title,
    questionText,
    subjectId,
    chapterId,
    pyqYear,
    hasVisualDiagram: Boolean(parsed.hasVisualDiagram),
  };
}

/**
 * On-demand step-by-step NCERT explanation for a saved doubt.
 */
export async function explainDoubtWithGemini(options: {
  apiKey: string;
  model?: string;
  subjectName: string;
  chapterTitle: string;
  classLevel: number;
  title: string;
  questionText: string;
  imageDataUrl?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const prompt = [
    `You are a clear, concise NCERT Class ${options.classLevel} ${options.subjectName} tutor.`,
    `Chapter: ${options.chapterTitle}`,
    `Doubt Title: ${options.title}`,
    `Question / Doubt:\n${options.questionText}`,
    '',
    'Provide a structured, concise explanation:',
    '1. Key NCERT concept / formula',
    '2. Step-by-step reasoning / calculation',
    '3. Final answer & 1-line exam takeaway to avoid future mistakes.',
    'Keep formatting clean plain text / light markdown without raw LaTeX delimiters.',
  ].join('\n');

  const parts: GeminiPart[] = [{ text: prompt }];
  if (options.imageDataUrl) {
    const { mimeType, base64 } = splitDataUrl(options.imageDataUrl);
    parts.push({ inlineData: { mimeType, data: base64 } });
  }

  const explanation = await callGeminiGenerateContent({
    apiKey: options.apiKey,
    model: options.model,
    parts,
    temperature: 0.25,
    fetchImpl: options.fetchImpl,
  });

  return explanation.trim();
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
