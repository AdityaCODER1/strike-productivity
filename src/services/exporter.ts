import {
  CategoryConfig,
  DEFAULT_CATEGORIES,
  LogEntry,
  StrikeExportPayload,
  TaskItem,
} from '../types/models';
import { sortLogsForDisplay, sortTasksForDisplay } from '../state/taskLogLogic';
import { toDateKey } from '../utils/date';

export function buildExportPayload(
  tasks: TaskItem[],
  logs: LogEntry[],
  categories: CategoryConfig[],
  now: Date = new Date()
): StrikeExportPayload {
  return {
    version: 1,
    exportedAt: now.toISOString(),
    app: 'Strike',
    tasks: sortTasksForDisplay(tasks),
    logs: sortLogsForDisplay(logs),
    categories,
  };
}

export function serializeToJson(
  tasks: TaskItem[],
  logs: LogEntry[],
  categories: CategoryConfig[],
  now: Date = new Date()
): string {
  return JSON.stringify(buildExportPayload(tasks, logs, categories, now), null, 2);
}

export function serializeToMarkdown(
  tasks: TaskItem[],
  logs: LogEntry[],
  now: Date = new Date()
): string {
  const dateLabel = toDateKey(now);
  const sortedTasks = sortTasksForDisplay(tasks);
  const openToday = sortedTasks.filter((t) => !t.completed && t.bucket === 'today');
  const openLater = sortedTasks.filter((t) => !t.completed && t.bucket === 'later');
  const sortedLogs = sortLogsForDisplay(logs);

  const lines: string[] = [
    `# Strike Export — ${dateLabel}`,
    '',
    '## Tasks Ahead',
    '',
    '### Today',
    ...(openToday.length > 0
      ? openToday.map((t) => `- [ ] ${t.title}${t.category ? ` \`${t.category}\`` : ''}`)
      : ['_No open tasks for today._']),
    '',
    '### Later',
    ...(openLater.length > 0
      ? openLater.map((t) => `- [ ] ${t.title}${t.category ? ` \`${t.category}\`` : ''}`)
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
        lines.push(`- **[${entry.category}]** ${entry.title}`);
      }
      lines.push('');
    }
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
    .map((t) => ({
      id: t.id,
      title: t.title,
      bucket: t.bucket === 'later' ? 'later' : 'today',
      completed: Boolean(t.completed),
      completedAt: typeof t.completedAt === 'number' ? t.completedAt : null,
      completedDateKey: typeof t.completedDateKey === 'string' ? t.completedDateKey : null,
      linkedLogEntryId: typeof t.linkedLogEntryId === 'string' ? t.linkedLogEntryId : null,
      category: typeof t.category === 'string' ? t.category : undefined,
      order: typeof t.order === 'number' ? t.order : 0,
      createdAt: typeof t.createdAt === 'number' ? t.createdAt : Date.now(),
      updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : Date.now(),
    }));

  const logs: LogEntry[] = parsed.logs
    .filter(
      (l): l is LogEntry =>
        Boolean(l && typeof l.id === 'string' && typeof l.title === 'string' && typeof l.dateKey === 'string')
    )
    .map((l) => ({
      id: l.id,
      dateKey: l.dateKey,
      title: l.title,
      category: typeof l.category === 'string' && l.category.trim() ? l.category : 'Personal',
      source: l.source === 'task_checkoff' || l.source === 'manual' ? l.source : 'brain_dump',
      linkedTaskId: typeof l.linkedTaskId === 'string' ? l.linkedTaskId : null,
      rawDumpId: typeof l.rawDumpId === 'string' ? l.rawDumpId : undefined,
      createdAt: typeof l.createdAt === 'number' ? l.createdAt : Date.now(),
      updatedAt: typeof l.updatedAt === 'number' ? l.updatedAt : Date.now(),
    }));

  const categories: CategoryConfig[] =
    Array.isArray(parsed.categories) && parsed.categories.length > 0
      ? parsed.categories.filter(
          (c): c is CategoryConfig => Boolean(c && typeof c.id === 'string' && typeof c.name === 'string')
        )
      : DEFAULT_CATEGORIES;

  return {
    version: 1,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : new Date().toISOString(),
    app: 'Strike',
    tasks,
    logs,
    categories,
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
