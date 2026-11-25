import {
  NcertChapter,
  StudySubjectId,
  buildCompactCatalogPrompt,
  getActiveChapters,
  getChapterById,
  getSubjectMeta,
  isDoubtsCategoryName,
  isMistakesCategoryName,
  isStudyTaggedCategory,
  isValidSubjectId,
} from '../data/ncertCatalog';
import {
  CategoryConfig,
  DEFAULT_GEMINI_MODEL,
  DoubtItem,
  MISTAKE_TYPES,
  MISTAKE_TYPE_META,
  MistakeItem,
  MistakeType,
  TaskBucket,
  TaskItem,
  isValidMistakeType,
} from '../types/models';
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

export interface ParsedBrainDumpMistake {
  title: string;
  mistakeText: string;
  correctionNote: string;
  mistakeType: MistakeType;
  subjectId: StudySubjectId;
  chapterId: string;
  sourceLabel?: string;
}

export interface BrainDumpAnalysisResult {
  completedActivities: ParsedCompletedActivity[];
  unfinishedTasks: ParsedUnfinishedTask[];
  doubts: ParsedBrainDumpDoubt[];
  mistakes: ParsedBrainDumpMistake[];
}

export type BrainDumpFocusMode = 'all' | 'mistakes';

export interface BrainDumpRequestOptions {
  apiKey: string;
  model?: string;
  rawText: string;
  categories: CategoryConfig[];
  openTasks: Pick<TaskItem, 'id' | 'title' | 'bucket'>[];
  dateKey: string;
  includeArchivedNcert?: boolean;
  focusMode?: BrainDumpFocusMode;
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
        'Only set for Learning, Doubts, or Mistakes items matching Physics, Chemistry, or Biology; MUST be null for all other categories.',
    },
    chapterId: {
      type: 'STRING',
      nullable: true,
      enum: activeChapterIds,
      description:
        'Exact NCERT chapter id from NCERT_CATALOG only when category is Learning, Doubts, or Mistakes; MUST be null for non-study items or if unclear.',
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
              enum: ['today', 'tomorrow', 'later'],
              description:
                'Use "today" for still-urgent today tasks, "tomorrow" for next-day follow-ups or deferred-until-tomorrow items, and "later" for general backlog.',
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
          'Explicit study doubts, confusions, or tricky Physics/Chemistry/Biology questions the user still needs explained or wants to review later.',
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
      mistakes: {
        type: 'ARRAY',
        description:
          'Explicit study mistakes, wrong answers, silly/calculation slips, forgotten formulas, misread options, or NCERT traps made during tests, PYQs, or practice.',
        items: {
          type: 'OBJECT',
          properties: {
            title: {
              type: 'STRING',
              description: 'Short clear summary of the mistake (max 90 chars).',
            },
            mistakeText: {
              type: 'STRING',
              description: 'Clear description of what went wrong or what error the user made.',
            },
            correctionNote: {
              type: 'STRING',
              description:
                'Concise correct concept, formula, or rule to remember next time (infer briefly if obvious from NCERT, else empty string).',
            },
            mistakeType: {
              type: 'STRING',
              enum: MISTAKE_TYPES,
              description:
                'Root cause: conceptual (concept gap), silly (calculation/sign/arithmetic slip), formula (forgot formula/constant/value), misread (missed NOT/incorrect/units), or ncert_trap (NCERT line/exception/fact trap).',
            },
            subjectId: {
              type: 'STRING',
              enum: SUBJECT_ENUM,
              description: 'PCB subject for this mistake.',
            },
            chapterId: {
              type: 'STRING',
              enum: activeChapterIds,
              description: 'Best matching NCERT chapter id from NCERT_CATALOG.',
            },
            sourceLabel: {
              type: 'STRING',
              nullable: true,
              description:
                'Optional short exam/test/source label if mentioned (e.g. "Mock #4", "PYQ 2022", "NCERT Back Ex"); otherwise null.',
            },
          },
          required: ['title', 'mistakeText', 'correctionNote', 'mistakeType', 'subjectId', 'chapterId'],
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
  includeArchivedNcert: boolean = false,
  focusMode: BrainDumpFocusMode = 'all'
): string {
  const openTasksContext =
    openTasks.length > 0
      ? openTasks.map((t) => `- id="${t.id}" [${t.bucket}]: ${t.title}`).join('\n')
      : '(none)';

  const modeLead =
    focusMode === 'mistakes'
      ? `You are Strike's NCERT PCB mistake-analysis assistant parsing a user's mistake dump for ${dateKey}. The user is specifically logging mistakes made in tests, PYQs, or practice.`
      : `You are Strike's personal daily log & NCERT PCB study assistant organizing a user's brain dump for ${dateKey}.`;

  const modeSpecificRules =
    focusMode === 'mistakes'
      ? [
          '1. Split every distinct mistake or error into the mistakes array with a crisp title, clear mistakeText (what went wrong), helpful correctionNote (the exact rule/formula/NCERT fact to remember), best mistakeType (conceptual | silly | formula | misread | ncert_trap), optional sourceLabel (e.g. "Mock #4", "NEET 2022"), and exact subjectId + chapterId from NCERT_CATALOG.',
          '2. Leave completedActivities and unfinishedTasks empty UNLESS the user explicitly mentions a separate finished task or follow-up to-do.',
          '3. If the user mentions an unresolved question they are still stuck on rather than a mistake made, place it in doubts.',
          '4. Do not invent mistakes, activities, or doubts the user did not mention.',
        ]
      : [
          '1. Split the text into distinct, concise completed activities (sentence case, no trailing period, clear action verb when natural).',
          `2. Assign EVERY item strictly one category from: ${categoryNames.join(', ')}.`,
          '3. If a completed activity clearly completes one of the OPEN_TASKS below, set matchedOpenTaskId to its exact id; otherwise set matchedOpenTaskId to null.',
          '4. If the user mentions something unfinished, skipped, blocked, or to do tomorrow/next, extract it into unfinishedTasks (do NOT duplicate items already in OPEN_TASKS). Use suggestedBucket="tomorrow" when they plan to do it tomorrow/next day, "today" for remaining today tasks, and "later" for general backlog.',
          '5. For items categorized as "Learning", "Doubts", or "Mistakes" about Physics, Chemistry, or Biology, tag subjectId and exact chapterId from NCERT_CATALOG below. For ALL non-study categories (Work, Personal, Health, Home, Social, etc.), ALWAYS set subjectId=null and chapterId=null.',
          '6. Distinguish Doubts vs Mistakes: if the user is still confused/stuck on a question and needs an explanation later, put it in doubts. If the user got a question wrong, made a silly/sign/formula slip, misread an option, or fell for an NCERT trap in a mock/PYQ/practice, put it in mistakes with subjectId, chapterId, mistakeType, correctionNote, and optional sourceLabel (and do not duplicate it as a completed activity unless they also did separate study work).',
          '7. Do not invent activities, doubts, or mistakes the user did not mention.',
        ];

  return [
    modeLead,
    'Rules:',
    ...modeSpecificRules,
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

function sanitizeParsedMistakes(rawList: unknown, includeArchived: boolean = false): ParsedBrainDumpMistake[] {
  if (!Array.isArray(rawList)) return [];
  const activeChapters = getActiveChapters(includeArchived);

  return rawList
    .filter((item): item is Partial<ParsedBrainDumpMistake> =>
      Boolean(
        item &&
          typeof item === 'object' &&
          ((typeof (item as { title?: unknown }).title === 'string' &&
            (item as { title: string }).title.trim()) ||
            (typeof (item as { mistakeText?: unknown }).mistakeText === 'string' &&
              (item as { mistakeText: string }).mistakeText.trim()))
      )
    )
    .map((item) => {
      const chap = getChapterById(typeof item.chapterId === 'string' ? item.chapterId : undefined);
      const subjectId: StudySubjectId =
        chap?.subjectId ?? (isValidSubjectId(item.subjectId) ? item.subjectId : 'physics');
      const fallbackChapter =
        chap?.id ?? activeChapters.find((c) => c.subjectId === subjectId)?.id ?? '';
      const cleanMistakeText =
        typeof item.mistakeText === 'string' && item.mistakeText.trim()
          ? item.mistakeText.trim()
          : (item.title ?? '').trim();
      const cleanTitle =
        typeof item.title === 'string' && item.title.trim()
          ? item.title.trim()
          : cleanMistakeText.slice(0, 80);
      const cleanCorrection =
        typeof item.correctionNote === 'string' ? item.correctionNote.trim() : '';
      const cleanSource =
        typeof item.sourceLabel === 'string' && item.sourceLabel.trim()
          ? item.sourceLabel.trim()
          : undefined;
      return {
        title: cleanTitle,
        mistakeText: cleanMistakeText,
        correctionNote: cleanCorrection,
        mistakeType: isValidMistakeType(item.mistakeType) ? item.mistakeType : 'conceptual',
        subjectId,
        chapterId: fallbackChapter,
        ...(cleanSource ? { sourceLabel: cleanSource } : {}),
      };
    })
    .filter((m) => Boolean(m.chapterId));
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
            suggestedBucket:
              item.suggestedBucket === 'tomorrow'
                ? 'tomorrow'
                : item.suggestedBucket === 'later'
                ? 'later'
                : 'today',
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

  const mistakes: ParsedBrainDumpMistake[] = sanitizeParsedMistakes(parsed.mistakes, true);

  // Promote any completedActivities explicitly categorized as Doubts or Mistakes with valid chapter if not already captured
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
    if (
      isMistakesCategoryName(act.category) &&
      act.subjectId &&
      act.chapterId &&
      !mistakes.some((m) => m.title.toLowerCase() === act.title.toLowerCase())
    ) {
      mistakes.push({
        title: act.title,
        mistakeText: act.title,
        correctionNote: '',
        mistakeType: 'conceptual',
        subjectId: act.subjectId,
        chapterId: act.chapterId,
      });
    }
  }

  return { completedActivities, unfinishedTasks, doubts, mistakes };
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
    throw new Error(
      options.focusMode === 'mistakes'
        ? 'Write a quick note about the mistakes you made first.'
        : 'Write a quick note about what you did first.'
    );
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
    includeArchived,
    options.focusMode ?? 'all'
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

/**
 * Parses raw mistake notes (single or multiple mistakes) into structured NCERT PCB mistake items.
 */
export async function extractMistakesFromTextWithGemini(options: {
  apiKey: string;
  model?: string;
  rawText: string;
  defaultSubjectId?: StudySubjectId;
  defaultChapterId?: string;
  includeArchivedNcert?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<ParsedBrainDumpMistake[]> {
  const trimmed = options.rawText.trim();
  if (!trimmed) {
    throw new Error('Paste or type your mistake notes first.');
  }

  const includeArchived = Boolean(options.includeArchivedNcert);
  const activeChapterIds = getActiveChapters(includeArchived).map((c) => c.id);
  const defaultChap = getChapterById(options.defaultChapterId);

  const schema = {
    type: 'OBJECT',
    properties: {
      mistakes: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            title: {
              type: 'STRING',
              description: 'Short clear summary of the mistake (max 90 chars).',
            },
            mistakeText: {
              type: 'STRING',
              description: 'Clear description of what went wrong.',
            },
            correctionNote: {
              type: 'STRING',
              description:
                'Concise correct concept, formula, or NCERT rule to remember next time.',
            },
            mistakeType: {
              type: 'STRING',
              enum: MISTAKE_TYPES,
              description: 'Root cause category.',
            },
            subjectId: {
              type: 'STRING',
              enum: SUBJECT_ENUM,
              description: 'PCB subject.',
            },
            chapterId: {
              type: 'STRING',
              enum: activeChapterIds,
              description: 'Best matching NCERT chapter id from NCERT_CATALOG.',
            },
            sourceLabel: {
              type: 'STRING',
              nullable: true,
              description: 'Optional test/PYQ source label if mentioned; otherwise null.',
            },
          },
          required: [
            'title',
            'mistakeText',
            'correctionNote',
            'mistakeType',
            'subjectId',
            'chapterId',
          ],
        },
      },
    },
    required: ['mistakes'],
  };

  const hintLines: string[] = [];
  if (defaultChap) {
    hintLines.push(
      `DEFAULT_CONTEXT (use only if the note does not specify a different chapter): ${defaultChap.id} (${getSubjectMeta(defaultChap.subjectId).name} - ${defaultChap.title})`
    );
  } else if (options.defaultSubjectId) {
    hintLines.push(
      `DEFAULT_SUBJECT_HINT (use only if unclear): ${options.defaultSubjectId}`
    );
  }

  const prompt = [
    'You are an NCERT Class 11/12 & NEET PCB mentor structuring raw student mistake notes into clean Mistake Log entries.',
    'Rules:',
    '1. Split the note into one or more distinct mistakes.',
    '2. For each mistake, assign the best matching subjectId and exact chapterId from NCERT_CATALOG.',
    '3. Classify mistakeType strictly as one of: conceptual, silly, formula, misread, ncert_trap.',
    '4. Write a crisp correctionNote stating the exact correct formula, NCERT fact, or exam rule to avoid repeating it (use clear Unicode math/chem symbols, no raw LaTeX).',
    '5. Extract sourceLabel if the note mentions a mock test, PYQ year, or book/exercise; otherwise null.',
    ...hintLines,
    '',
    'NCERT_CATALOG (chapterId | subjectId | Class | Title):',
    buildCompactCatalogPrompt(includeArchived),
    '',
    'STUDENT_MISTAKE_NOTES:',
    trimmed,
  ].join('\n');

  const textPart = await callGeminiGenerateContent({
    apiKey: options.apiKey,
    model: options.model,
    parts: [{ text: prompt }],
    temperature: 0.2,
    responseSchema: schema,
    fetchImpl: options.fetchImpl,
  });

  const parsed = JSON.parse(cleanModelJson(textPart)) as { mistakes?: unknown };
  return sanitizeParsedMistakes(parsed.mistakes, includeArchived);
}

export type ChapterSummaryScope = 'mistakes' | 'doubts';

/**
 * Generates a focused pre-exam revision summary for all Mistakes or all Doubts in a single NCERT chapter.
 */
export async function summarizeChapterItemsWithGemini(options: {
  apiKey: string;
  model?: string;
  chapter: NcertChapter;
  scope: ChapterSummaryScope;
  mistakes?: MistakeItem[];
  doubts?: DoubtItem[];
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const subjectMeta = getSubjectMeta(options.chapter.subjectId);

  if (options.scope === 'mistakes') {
    const items = options.mistakes ?? [];
    if (items.length === 0) {
      throw new Error('Log at least one mistake in this chapter to generate a summary.');
    }

    const formatted = items
      .map((m, idx) => {
        const typeLabel = MISTAKE_TYPE_META[m.mistakeType]?.label ?? m.mistakeType;
        const repeatTag = m.repeatCount > 1 ? ` | Repeated ${m.repeatCount}x` : '';
        const srcTag = m.sourceLabel ? ` | Source: ${m.sourceLabel}` : '';
        const statusTag = m.status === 'fixed' ? ' [Fixed]' : ' [Active]';
        return [
          `${idx + 1}. ${m.title}${statusTag} (${typeLabel}${repeatTag}${srcTag})`,
          m.mistakeText && m.mistakeText !== m.title ? `   Error: ${m.mistakeText}` : '',
          m.correctionNote ? `   Rule/Fix: ${m.correctionNote}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n');

    const prompt = [
      `You are an experienced NCERT Class ${options.chapter.classLevel} ${subjectMeta.name} & NEET mentor creating a concise pre-exam Mistake Revision Summary for one chapter.`,
      `Chapter: ${options.chapter.title}`,
      '',
      'Synthesize the student’s logged mistakes below into a crisp, high-yield summary:',
      '1. Top Weak Spots & Patterns (call out recurring error types & repeated mistakes first)',
      '2. Must-Remember Rules, Formulas & NCERT Traps (short scannable bullet points)',
      '3. Quick Pre-Exam Check (1–2 concrete things to double-check before solving this chapter)',
      'Keep it compact, scannable plain text / simple bullets without raw LaTeX delimiters.',
      '',
      'CHAPTER_MISTAKES:',
      formatted,
    ].join('\n');

    const summary = await callGeminiGenerateContent({
      apiKey: options.apiKey,
      model: options.model,
      parts: [{ text: prompt }],
      temperature: 0.25,
      fetchImpl: options.fetchImpl,
    });

    return summary.trim();
  }

  const items = options.doubts ?? [];
  if (items.length === 0) {
    throw new Error('Save at least one doubt in this chapter to generate a summary.');
  }

  const formatted = items
    .map((d, idx) => {
      const pyqTag = d.pyqYear ? ` | PYQ ${d.pyqYear}` : '';
      const statusTag = d.status === 'resolved' ? ' [Resolved]' : ' [Open]';
      return [
        `${idx + 1}. ${d.title}${statusTag}${pyqTag}`,
        d.questionText && d.questionText !== d.title ? `   Question: ${d.questionText}` : '',
        d.resolutionNote ? `   Takeaway: ${d.resolutionNote}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  const prompt = [
    `You are an experienced NCERT Class ${options.chapter.classLevel} ${subjectMeta.name} & NEET mentor creating a concise Chapter Doubts Revision Summary.`,
    `Chapter: ${options.chapter.title}`,
    '',
    'Synthesize all of the student’s saved doubts for this chapter into a crisp, high-yield summary:',
    '1. Core Confusion Themes (group related conceptual gaps across these doubts)',
    '2. Key Clarifications & Takeaways (clear NCERT rules/formulas resolving the tricky spots)',
    '3. Still-Open Focus (what to review next if any doubts remain open)',
    'Keep it compact, scannable plain text / simple bullets without raw LaTeX delimiters.',
    '',
    'CHAPTER_DOUBTS:',
    formatted,
  ].join('\n');

  const summary = await callGeminiGenerateContent({
    apiKey: options.apiKey,
    model: options.model,
    parts: [{ text: prompt }],
    temperature: 0.25,
    fetchImpl: options.fetchImpl,
  });

  return summary.trim();
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
