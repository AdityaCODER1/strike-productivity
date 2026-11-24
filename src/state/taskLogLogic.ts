import { CategoryConfig, LogEntry, TaskBucket, TaskItem } from '../types/models';
import { createId, toDateKey } from '../utils/date';

export interface DomainState {
  tasks: TaskItem[];
  logs: LogEntry[];
}

export function createTaskRecord(
  title: string,
  bucket: TaskBucket,
  existingTasks: TaskItem[],
  options?: { category?: string; now?: number }
): TaskItem {
  const trimmed = title.trim();
  const now = options?.now ?? Date.now();
  const minOrder = existingTasks.reduce((min, item) => Math.min(min, item.order), 0);

  return {
    id: createId('task'),
    title: trimmed,
    bucket,
    completed: false,
    completedAt: null,
    completedDateKey: null,
    linkedLogEntryId: null,
    category: options?.category,
    order: minOrder - 1,
    createdAt: now,
    updatedAt: now,
  };
}

export interface ToggleTaskResult {
  nextState: DomainState;
  updatedTask: TaskItem;
  createdLog: LogEntry | null;
  deletedLogId: string | null;
}

/**
 * Checking off an open task moves it into Completed Today and automatically creates
 * a linked Daily Log entry. Unchecking it reverts the task and removes that linked entry.
 */
export function toggleTaskCompletionLogic(
  state: DomainState,
  taskId: string,
  categories: CategoryConfig[],
  options?: { todayKey?: string; now?: number }
): ToggleTaskResult | null {
  const target = state.tasks.find((t) => t.id === taskId);
  if (!target) return null;

  const now = options?.now ?? Date.now();
  const todayKey = options?.todayKey ?? toDateKey(new Date(now));
  const fallbackCategory = categories[0]?.name ?? 'Personal';

  if (!target.completed) {
    const logId = createId('log');
    const resolvedCategory =
      target.category && categories.some((c) => c.name === target.category)
        ? target.category
        : fallbackCategory;

    const createdLog: LogEntry = {
      id: logId,
      dateKey: todayKey,
      title: target.title,
      category: resolvedCategory,
      source: 'task_checkoff',
      linkedTaskId: target.id,
      createdAt: now,
      updatedAt: now,
    };

    const updatedTask: TaskItem = {
      ...target,
      completed: true,
      completedAt: now,
      completedDateKey: todayKey,
      linkedLogEntryId: logId,
      updatedAt: now,
    };

    return {
      nextState: {
        tasks: state.tasks.map((t) => (t.id === taskId ? updatedTask : t)),
        logs: [createdLog, ...state.logs],
      },
      updatedTask,
      createdLog,
      deletedLogId: null,
    };
  }

  // Unchecking: remove linked daily log entry if it still exists
  const deletedLogId = target.linkedLogEntryId;
  const updatedTask: TaskItem = {
    ...target,
    completed: false,
    completedAt: null,
    completedDateKey: null,
    linkedLogEntryId: null,
    updatedAt: now,
  };

  return {
    nextState: {
      tasks: state.tasks.map((t) => (t.id === taskId ? updatedTask : t)),
      logs: deletedLogId ? state.logs.filter((l) => l.id !== deletedLogId) : state.logs,
    },
    updatedTask,
    createdLog: null,
    deletedLogId,
  };
}

/**
 * Mark an open task completed because Gemini matched it to a brain-dump activity,
 * linking it to that existing log entry without duplicating the activity in Today's log.
 */
export function markTaskCompletedFromMatchedLog(
  tasks: TaskItem[],
  taskId: string,
  linkedLogEntryId: string,
  dateKey: string,
  now: number = Date.now()
): { nextTasks: TaskItem[]; updatedTask: TaskItem | null } {
  const target = tasks.find((t) => t.id === taskId);
  if (!target) return { nextTasks: tasks, updatedTask: null };

  const updatedTask: TaskItem = {
    ...target,
    completed: true,
    completedAt: now,
    completedDateKey: dateKey,
    linkedLogEntryId,
    updatedAt: now,
  };

  return {
    nextTasks: tasks.map((t) => (t.id === taskId ? updatedTask : t)),
    updatedTask,
  };
}

export function moveTaskBucketLogic(
  tasks: TaskItem[],
  taskId: string,
  bucket: TaskBucket,
  now: number = Date.now()
): { nextTasks: TaskItem[]; updatedTask: TaskItem | null } {
  const target = tasks.find((t) => t.id === taskId);
  if (!target) return { nextTasks: tasks, updatedTask: null };

  const updatedTask: TaskItem = {
    ...target,
    bucket,
    updatedAt: now,
  };

  return {
    nextTasks: tasks.map((t) => (t.id === taskId ? updatedTask : t)),
    updatedTask,
  };
}

export function sortTasksForDisplay(tasks: TaskItem[]): TaskItem[] {
  return [...tasks].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return b.createdAt - a.createdAt;
  });
}

export function sortLogsForDisplay(logs: LogEntry[]): LogEntry[] {
  return [...logs].sort((a, b) => {
    if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey);
    return b.createdAt - a.createdAt;
  });
}
