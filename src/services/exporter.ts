import { getChapterById, getSubjectMeta, isValidSubjectId } from '../data/ncertCatalog';
import {
  CategoryConfig,
  ChapterStudyState,
  DEFAULT_CATEGORIES,
  DEFAULT_STUDY_SETTINGS,
  DoubtItem,
  LogEntry,
  StrikeExportPayload,
  StudySettings,
  TaskItem,
} from '../types/models';
import { sortLogsForDisplay, sortTasksForDisplay } from '../state/taskLogLogic';
import { toDateKey } from '../utils/date';

export interface StudyExportExtras {
  chapterProgress?: Record<string, ChapterStudyState>;
  doubts?: DoubtItem[];
  studySettings?: StudySettings;
}

export function buildExportPayload(
  tasks: TaskItem[],
  logs: LogEntry[],
  categories: CategoryConfig[],
  now: Date = new Date(),
  extras?: StudyExportExtras
): StrikeExportPayload {
  const hasExtras = Boolean(
    extras &&
      ((extras.chapterProgress && Object.keys(extras.chapterProgress).length > 0) ||
        (extras.doubts && extras.doubts.length > 0) ||
        extras.studySettings)
  );

  return {
    version: hasExtras ? 2 : 1,
    exportedAt: now.toISOString(),
    app: 'Strike',
    tasks: sortTasksForDisplay(tasks),
    logs: sortLogsForDisplay(logs),
    categories,
    ...(extras?.chapterProgress ? { chapterProgress: extras.chapterProgress } : {}),
    ...(extras?.doubts ? { doubts: extras.doubts } : {}),
    ...(extras?.studySettings ? { studySettings: extras.studySettings } : {}),
  };
}

export function serializeToJson(
  tasks: TaskItem[],
  logs: LogEntry[],
  categories: CategoryConfig[],
  now: Date = new Date(),
  extras?: StudyExportExtras
): string {
  return JSON.stringify(buildExportPayload(tasks, logs, categories, now, extras), null, 2);
}

export function serializeToMarkdown(
  tasks: TaskItem[],
  logs: LogEntry[],
  now: Date = new Date(),
  extras?: StudyExportExtras
): string {
  const dateLabel = toDateKey(now);
  const sortedTasks = sortTasksForDisplay(tasks);
  const openToday = sortedTasks.filter((t) => !t.completed && t.bucket === 'today');
  const openLater = sortedTasks.filter((t) => !t.completed && t.bucket === 'later');
  const sortedLogs = sortLogsForDisplay(logs);

  const formatChapterTag = (chapterId?: string) => {
    const ch = getChapterById(chapterId);
    if (!ch) return '';
    return ` _(${getSubjectMeta(ch.subjectId).shortName} Cl.${ch.classLevel}: ${ch.title})_`;
  };

  const lines: string[] = [
    `# Strike Export — ${dateLabel}`,
    '',
    '## Tasks Ahead',
    '',
    '### Today',
    ...(openToday.length > 0
      ? openToday.map(
          (t) => `- [ ] ${t.title}${t.category ? ` \`${t.category}\`` : ''}${formatChapterTag(t.chapterId)}`
        )
      : ['_No open tasks for today._']),
    '',
    '### Later',
    ...(openLater.length > 0
      ? openLater.map(
          (t) => `- [ ] ${t.title}${t.category ? ` \`${t.category}\`` : ''}${formatChapterTag(t.chapterId)}`
        )
      : ['_No backlog tasks._']),
    '',
    '## Daily Activity Log',
    '',
  ];

  if (sortedLogs.length === 0) {
    lines.push('_No logged activities yet._');
  } else {
    const grouped = new Map<string, LogEntry[]>();
    for (const entry of sortedLogs) {
      const bucket = grouped.get(entry.dateKey) ?? [];
      bucket.push(entry);
      grouped.set(entry.dateKey, bucket);
    }

    for (const [day, entries] of grouped.entries()) {
      lines.push(`### ${day}`);
      for (const entry of entries) {
        lines.push(`- **[${entry.category}]** ${entry.title}${formatChapterTag(entry.chapterId)}`);
      }
      lines.push('');
    }
  }

  const progressItems = Object.values(extras?.chapterProgress ?? {}).filter(
    (p) => p.coveragePercent > 0 || p.completedPyqYears.length > 0
  );
  if (progressItems.length > 0) {
    lines.push('## NCERT Chapter Progress', '');
    for (const p of progressItems) {
      const ch = getChapterById(p.chapterId);
      if (!ch) continue;
      const pyqStr =
        p.completedPyqYears.length > 0
          ? ` · PYQs: ${[...p.completedPyqYears].sort((a, b) => b - a).join(', ')}`
          : '';
      lines.push(
        `- **${getSubjectMeta(ch.subjectId).name} Cl.${ch.classLevel} — ${ch.title}**: ${p.coveragePercent}%${pyqStr}`
      );
      if (p.aiSummary) {
        lines.push(`  - ${p.aiSummary}`);
      }
    }
    lines.push('');
  }

  const doubts = extras?.doubts ?? [];
  if (doubts.length > 0) {
    lines.push('## Doubts Archive', '');
    for (const d of doubts) {
      const ch = getChapterById(d.chapterId);
      const chapLabel = ch
        ? `${getSubjectMeta(ch.subjectId).shortName} Cl.${ch.classLevel} · ${ch.title}`
        : d.subjectId;
      const statusBox = d.status === 'resolved' ? '[x]' : '[ ]';
      const pyqNote = d.pyqYear ? ` [PYQ ${d.pyqYear}]` : '';
      lines.push(`- ${statusBox} **${d.title}**${pyqNote} _(${chapLabel})_`);
      if (d.questionText && d.questionText !== d.title) {
        lines.push(`  - Question: ${d.questionText}`);
      }
      if (d.resolutionNote) {
        lines.push(`  - Takeaway: ${d.resolutionNote}`);
      }
    }
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

export function parseImportJson(rawJson: string): StrikeExportPayload {
  const parsed = JSON.parse(rawJson) as Partial<StrikeExportPayload>;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid JSON backup file.');
  }

  if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.logs)) {
    throw new Error('Backup JSON must include "tasks" and "logs" arrays.');
  }

  const tasks: TaskItem[] = parsed.tasks
    .filter((t): t is TaskItem => Boolean(t && typeof t.id === 'string' && typeof t.title === 'string'))
    .map((t) => {
      const chap = getChapterById(typeof t.chapterId === 'string' ? t.chapterId : undefined);
      return {
        id: t.id,
        title: t.title,
        bucket: t.bucket === 'later' ? 'later' : 'today',
        completed: Boolean(t.completed),
        completedAt: typeof t.completedAt === 'number' ? t.completedAt : null,
        completedDateKey: typeof t.completedDateKey === 'string' ? t.completedDateKey : null,
        linkedLogEntryId: typeof t.linkedLogEntryId === 'string' ? t.linkedLogEntryId : null,
        category: typeof t.category === 'string' ? t.category : undefined,
        ...(chap
          ? { subjectId: chap.subjectId, chapterId: chap.id }
          : isValidSubjectId(t.subjectId)
          ? { subjectId: t.subjectId }
          : {}),
        order: typeof t.order === 'number' ? t.order : 0,
        createdAt: typeof t.createdAt === 'number' ? t.createdAt : Date.now(),
        updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : Date.now(),
      };
    });

  const logs: LogEntry[] = parsed.logs
    .filter(
      (l): l is LogEntry =>
        Boolean(l && typeof l.id === 'string' && typeof l.title === 'string' && typeof l.dateKey === 'string')
    )
    .map((l) => {
      const chap = getChapterById(typeof l.chapterId === 'string' ? l.chapterId : undefined);
      return {
        id: l.id,
        dateKey: l.dateKey,
        title: l.title,
        category: typeof l.category === 'string' && l.category.trim() ? l.category : 'Personal',
        ...(chap
          ? { subjectId: chap.subjectId, chapterId: chap.id }
          : isValidSubjectId(l.subjectId)
          ? { subjectId: l.subjectId }
          : {}),
        source: l.source === 'task_checkoff' || l.source === 'manual' ? l.source : 'brain_dump',
        linkedTaskId: typeof l.linkedTaskId === 'string' ? l.linkedTaskId : null,
        rawDumpId: typeof l.rawDumpId === 'string' ? l.rawDumpId : undefined,
        createdAt: typeof l.createdAt === 'number' ? l.createdAt : Date.now(),
        updatedAt: typeof l.updatedAt === 'number' ? l.updatedAt : Date.now(),
      };
    });

  const categories: CategoryConfig[] =
    Array.isArray(parsed.categories) && parsed.categories.length > 0
      ? parsed.categories.filter(
          (c): c is CategoryConfig => Boolean(c && typeof c.id === 'string' && typeof c.name === 'string')
        )
      : DEFAULT_CATEGORIES;

  let chapterProgress: Record<string, ChapterStudyState> | undefined;
  if (parsed.chapterProgress && typeof parsed.chapterProgress === 'object') {
    chapterProgress = {};
    for (const [key, val] of Object.entries(parsed.chapterProgress)) {
      const chap = getChapterById(val?.chapterId || key);
      if (!chap || !val) continue;
      chapterProgress[chap.id] = {
        chapterId: chap.id,
        subjectId: chap.subjectId,
        coveragePercent: Math.max(0, Math.min(100, Math.round(Number(val.coveragePercent) || 0))),
        coverageSource: val.coverageSource === 'manual' ? 'manual' : 'ai',
        aiSummary: typeof val.aiSummary === 'string' ? val.aiSummary : undefined,
        lastEvaluatedAt: typeof val.lastEvaluatedAt === 'number' ? val.lastEvaluatedAt : undefined,
        completedPyqYears: Array.isArray(val.completedPyqYears)
          ? Array.from(
              new Set(
                val.completedPyqYears
                  .map((y) => Math.floor(Number(y)))
                  .filter((y) => Number.isFinite(y) && y >= 1988 && y <= 2035)
              )
            ).sort((a, b) => b - a)
          : [],
        updatedAt: typeof val.updatedAt === 'number' ? val.updatedAt : Date.now(),
      };
    }
  }

  let doubts: DoubtItem[] | undefined;
  if (Array.isArray(parsed.doubts)) {
    doubts = parsed.doubts
      .filter((d): d is DoubtItem => Boolean(d && typeof d.id === 'string' && typeof d.title === 'string'))
      .map((d) => {
        const chap = getChapterById(d.chapterId);
        const subjectId = chap?.subjectId ?? (isValidSubjectId(d.subjectId) ? d.subjectId : 'physics');
        const chapterId = chap?.id ?? (typeof d.chapterId === 'string' ? d.chapterId : '');
        return {
          id: d.id,
          subjectId,
          chapterId,
          title: d.title.trim(),
          questionText: typeof d.questionText === 'string' ? d.questionText : d.title.trim(),
          imageDataUrl: typeof d.imageDataUrl === 'string' ? d.imageDataUrl : null,
          pyqYear: typeof d.pyqYear === 'number' && Number.isFinite(d.pyqYear) ? Math.floor(d.pyqYear) : null,
          status: d.status === 'resolved' ? 'resolved' : 'open',
          resolutionNote: typeof d.resolutionNote === 'string' ? d.resolutionNote : '',
          aiExplanation: typeof d.aiExplanation === 'string' ? d.aiExplanation : undefined,
          source:
            d.source === 'photo_ocr' || d.source === 'brain_dump' ? d.source : 'manual',
          createdAt: typeof d.createdAt === 'number' ? d.createdAt : Date.now(),
          updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : Date.now(),
        };
      });
  }

  let studySettings: StudySettings | undefined;
  if (parsed.studySettings && typeof parsed.studySettings === 'object') {
    const start = Math.floor(Number(parsed.studySettings.pyqYearStart) || DEFAULT_STUDY_SETTINGS.pyqYearStart);
    const end = Math.floor(Number(parsed.studySettings.pyqYearEnd) || DEFAULT_STUDY_SETTINGS.pyqYearEnd);
    studySettings = {
      showArchivedNcert: Boolean(parsed.studySettings.showArchivedNcert),
      pyqYearStart: Math.max(1988, Math.min(2035, Math.min(start, end))),
      pyqYearEnd: Math.max(1988, Math.min(2035, Math.max(start, end))),
    };
  }

  return {
    version: parsed.version === 2 || chapterProgress || doubts ? 2 : 1,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    app: 'Strike',
    tasks,
    logs,
    categories,
    ...(chapterProgress ? { chapterProgress } : {}),
    ...(doubts ? { doubts } : {}),
    ...(studySettings ? { studySettings } : {}),
  };
}

export function triggerFileDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
