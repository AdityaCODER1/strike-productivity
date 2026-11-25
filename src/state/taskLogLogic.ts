import { StudySubjectId } from '../data/ncertCatalog';
import { CategoryConfig, LogEntry, TaskBucket, TaskItem } from '../types/models';
import { addDaysToDateKey, createId, getTomorrowDateKey, toDateKey } from '../utils/date';

export interface DomainState {
  tasks: TaskItem[];
  logs: LogEntry[];
}

export function createTaskRecord(
  title: string,
  bucket: TaskBucket,
  existingTasks: TaskItem[],
  options?: {
    category?: string;
    subjectId?: StudySubjectId;
    chapterId?: string;
    scheduledForDateKey?: string;
    now?: number;
  }
): TaskItem {
  const trimmed = title.trim();
  const now = options?.now ?? Date.now();
  const minOrder = existingTasks.reduce((min, item) => Math.min(min, item.order), 0);
  const scheduledForDateKey =
    bucket === 'tomorrow'
      ? options?.scheduledForDateKey ?? getTomorrowDateKey(new Date(now))
      : undefined;

  return {
    id: createId('task'),
    title: trimmed,
    bucket,
    ...(scheduledForDateKey ? { scheduledForDateKey } : {}),
    completed: false,
    completedAt: null,
    completedDateKey: null,
    linkedLogEntryId: null,
    category: options?.category,
    subjectId: options?.subjectId,
    chapterId: options?.chapterId,
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
      subjectId: target.subjectId,
      chapterId: target.chapterId,
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
  now: number = Date.now(),
  options?: { scheduledForDateKey?: string }
): { nextTasks: TaskItem[]; updatedTask: TaskItem | null } {
  const target = tasks.find((t) => t.id === taskId);
  if (!target) return { nextTasks: tasks, updatedTask: null };

  const { scheduledForDateKey: _prevScheduled, ...rest } = target;
  const scheduledForDateKey =
    bucket === 'tomorrow'
      ? options?.scheduledForDateKey ?? getTomorrowDateKey(new Date(now))
      : undefined;

  const updatedTask: TaskItem = {
    ...rest,
    bucket,
    ...(scheduledForDateKey ? { scheduledForDateKey } : {}),
    updatedAt: now,
  };

  return {
    nextTasks: tasks.map((t) => (t.id === taskId ? updatedTask : t)),
    updatedTask,
  };
}

export interface BulkTaskMoveResult {
  nextTasks: TaskItem[];
  changedTasks: TaskItem[];
  promotedCount: number;
}

/**
 * Promote open Tomorrow tasks to the top of Today (preserving their relative display order).
 * - mode === 'due_only': promotes tasks whose scheduledForDateKey <= todayKey, and backfills
 *   scheduledForDateKey = tomorrowKey on any open Tomorrow task missing a scheduled date.
 * - mode === 'all': promotes all open Tomorrow tasks immediately (manual "Move all to Today").
 */
export function promoteTomorrowTasksLogic(
  tasks: TaskItem[],
  options?: {
    mode?: 'due_only' | 'all';
    todayKey?: string;
    now?: number;
  }
): BulkTaskMoveResult {
  const now = options?.now ?? Date.now();
  const todayKey = options?.todayKey ?? toDateKey(new Date(now));
  const tomorrowKey = addDaysToDateKey(todayKey, 1);
  const mode = options?.mode ?? 'due_only';

  const sorted = sortTasksForDisplay(tasks);
  const toPromote: TaskItem[] = [];
  const toBackfillIds = new Set<string>();

  for (const task of sorted) {
    if (task.completed || task.bucket !== 'tomorrow') continue;
    if (mode === 'all') {
      toPromote.push(task);
    } else if (task.scheduledForDateKey) {
      if (task.scheduledForDateKey <= todayKey) {
        toPromote.push(task);
      }
    } else {
      toBackfillIds.add(task.id);
    }
  }

  if (toPromote.length === 0 && toBackfillIds.size === 0) {
    return { nextTasks: tasks, changedTasks: [], promotedCount: 0 };
  }

  const minOrder = tasks.reduce((min, item) => Math.min(min, item.order), 0);
  const promotedMap = new Map<string, TaskItem>();
  toPromote.forEach((task, index) => {
    const { scheduledForDateKey: _cleared, ...rest } = task;
    promotedMap.set(task.id, {
      ...rest,
      bucket: 'today',
      order: minOrder - toPromote.length + index,
      updatedAt: now,
    });
  });

  const changedTasks: TaskItem[] = [];
  const nextTasks = tasks.map((task) => {
    const promoted = promotedMap.get(task.id);
    if (promoted) {
      changedTasks.push(promoted);
      return promoted;
    }
    if (toBackfillIds.has(task.id)) {
      const backfilled: TaskItem = {
        ...task,
        scheduledForDateKey: tomorrowKey,
        updatedAt: now,
      };
      changedTasks.push(backfilled);
      return backfilled;
    }
    return task;
  });

  return {
    nextTasks: sortTasksForDisplay(nextTasks),
    changedTasks,
    promotedCount: toPromote.length,
  };
}

/**
 * Defer all open Today tasks into Tomorrow (preserving their relative display order at top).
 */
export function deferTodayTasksToTomorrowLogic(
  tasks: TaskItem[],
  options?: {
    todayKey?: string;
    tomorrowKey?: string;
    now?: number;
  }
): { nextTasks: TaskItem[]; changedTasks: TaskItem[] } {
  const now = options?.now ?? Date.now();
  const todayKey = options?.todayKey ?? toDateKey(new Date(now));
  const tomorrowKey = options?.tomorrowKey ?? addDaysToDateKey(todayKey, 1);

  const sortedOpenToday = sortTasksForDisplay(tasks).filter(
    (task) => !task.completed && task.bucket === 'today'
  );
  if (sortedOpenToday.length === 0) {
    return { nextTasks: tasks, changedTasks: [] };
  }

  const minOrder = tasks.reduce((min, item) => Math.min(min, item.order), 0);
  const deferredMap = new Map<string, TaskItem>();
  sortedOpenToday.forEach((task, index) => {
    deferredMap.set(task.id, {
      ...task,
      bucket: 'tomorrow',
      scheduledForDateKey: tomorrowKey,
      order: minOrder - sortedOpenToday.length + index,
      updatedAt: now,
    });
  });

  const changedTasks: TaskItem[] = [];
  const nextTasks = tasks.map((task) => {
    const deferred = deferredMap.get(task.id);
    if (deferred) {
      changedTasks.push(deferred);
      return deferred;
    }
    return task;
  });

  return {
    nextTasks: sortTasksForDisplay(nextTasks),
    changedTasks,
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
