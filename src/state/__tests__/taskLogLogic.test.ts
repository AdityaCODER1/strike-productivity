import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../../types/models';
import {
  createTaskRecord,
  deferTodayTasksToTomorrowLogic,
  markTaskCompletedFromMatchedLog,
  moveTaskBucketLogic,
  promoteTomorrowTasksLogic,
  toggleTaskCompletionLogic,
} from '../taskLogLogic';

describe('taskLogLogic', () => {
  it('creates tasks in Today, Tomorrow, or Later buckets with descending order and tomorrow date stamp', () => {
    const nov25Noon = new Date(2026, 10, 25, 12, 0, 0).getTime();
    const first = createTaskRecord('Ship v1', 'today', [], { now: nov25Noon });
    const second = createTaskRecord('Prep slides', 'tomorrow', [first], { now: nov25Noon + 1000 });
    const third = createTaskRecord('Buy groceries', 'later', [first, second], {
      now: nov25Noon + 2000,
    });

    expect(first.bucket).toBe('today');
    expect(first.scheduledForDateKey).toBeUndefined();
    expect(second.bucket).toBe('tomorrow');
    expect(second.scheduledForDateKey).toBe('2026-11-26');
    expect(third.bucket).toBe('later');
    expect(third.scheduledForDateKey).toBeUndefined();
    expect(second.order).toBeLessThan(first.order);
    expect(third.order).toBeLessThan(second.order);
  });

  it('auto-creates a linked daily log entry when checked off and removes it when unchecked', () => {
    const task = createTaskRecord('Submit quarterly review', 'today', [], {
      category: 'Work',
      now: 1000,
    });
    const brainDumpLog = {
      id: 'log_existing',
      dateKey: '2026-11-23',
      title: 'Went for a morning run',
      category: 'Health',
      source: 'brain_dump' as const,
      linkedTaskId: null,
      createdAt: 900,
      updatedAt: 900,
    };

    const checked = toggleTaskCompletionLogic(
      { tasks: [task], logs: [brainDumpLog] },
      task.id,
      DEFAULT_CATEGORIES,
      { todayKey: '2026-11-23', now: 2000 }
    );

    expect(checked).not.toBeNull();
    expect(checked!.updatedTask.completed).toBe(true);
    expect(checked!.updatedTask.completedDateKey).toBe('2026-11-23');
    expect(checked!.createdLog).not.toBeNull();
    expect(checked!.createdLog!.title).toBe('Submit quarterly review');
    expect(checked!.createdLog!.category).toBe('Work');
    expect(checked!.createdLog!.source).toBe('task_checkoff');
    expect(checked!.nextState.logs).toHaveLength(2);

    // Unchecking removes only the linked log entry, keeping brain dump entry intact
    const unchecked = toggleTaskCompletionLogic(
      checked!.nextState,
      task.id,
      DEFAULT_CATEGORIES,
      { todayKey: '2026-11-23', now: 3000 }
    );

    expect(unchecked).not.toBeNull();
    expect(unchecked!.updatedTask.completed).toBe(false);
    expect(unchecked!.updatedTask.linkedLogEntryId).toBeNull();
    expect(unchecked!.deletedLogId).toBe(checked!.createdLog!.id);
    expect(unchecked!.nextState.logs).toEqual([brainDumpLog]);
  });

  it('allows checking off a Tomorrow task early into Today log and restores it to Tomorrow when unchecked', () => {
    const tmrwTask = createTaskRecord('Revise Wave Optics', 'tomorrow', [], {
      category: 'Learning',
      scheduledForDateKey: '2026-11-26',
      now: 1000,
    });

    const checked = toggleTaskCompletionLogic(
      { tasks: [tmrwTask], logs: [] },
      tmrwTask.id,
      DEFAULT_CATEGORIES,
      { todayKey: '2026-11-25', now: 2000 }
    );

    expect(checked!.updatedTask.completed).toBe(true);
    expect(checked!.createdLog?.dateKey).toBe('2026-11-25');

    const unchecked = toggleTaskCompletionLogic(
      checked!.nextState,
      tmrwTask.id,
      DEFAULT_CATEGORIES,
      { todayKey: '2026-11-25', now: 3000 }
    );

    expect(unchecked!.updatedTask.completed).toBe(false);
    expect(unchecked!.updatedTask.bucket).toBe('tomorrow');
    expect(unchecked!.updatedTask.scheduledForDateKey).toBe('2026-11-26');
    expect(unchecked!.nextState.logs).toHaveLength(0);
  });

  it('moves tasks cleanly across Today, Tomorrow, and Later buckets and updates scheduledForDateKey', () => {
    const nov25Noon = new Date(2026, 10, 25, 12, 0, 0).getTime();
    const task = createTaskRecord('Plan weekend trip', 'later', [], { now: nov25Noon });

    const toTomorrow = moveTaskBucketLogic([task], task.id, 'tomorrow', nov25Noon + 1000);
    expect(toTomorrow.updatedTask?.bucket).toBe('tomorrow');
    expect(toTomorrow.updatedTask?.scheduledForDateKey).toBe('2026-11-26');

    const toToday = moveTaskBucketLogic(toTomorrow.nextTasks, task.id, 'today', nov25Noon + 2000);
    expect(toToday.updatedTask?.bucket).toBe('today');
    expect(toToday.updatedTask?.scheduledForDateKey).toBeUndefined();
  });

  it('auto-promotes due Tomorrow tasks to the top of Today in order while keeping unfinished Today tasks below', () => {
    const existingToday = createTaskRecord('Leftover today task', 'today', [], { now: 1000 });
    const tmrwFirst = createTaskRecord('Tomorrow #1', 'tomorrow', [existingToday], {
      scheduledForDateKey: '2026-11-26',
      now: 2000,
    });
    const tmrwSecond = createTaskRecord('Tomorrow #2', 'tomorrow', [existingToday, tmrwFirst], {
      scheduledForDateKey: '2026-11-26',
      now: 3000,
    });
    const futureTmrw = createTaskRecord('Future task', 'tomorrow', [existingToday, tmrwFirst, tmrwSecond], {
      scheduledForDateKey: '2026-11-27',
      now: 4000,
    });

    // Before midnight on Nov 25: nothing due yet
    const beforeMidnight = promoteTomorrowTasksLogic(
      [existingToday, tmrwFirst, tmrwSecond, futureTmrw],
      { mode: 'due_only', todayKey: '2026-11-25', now: 5000 }
    );
    expect(beforeMidnight.promotedCount).toBe(0);
    expect(beforeMidnight.changedTasks).toHaveLength(0);

    // On Nov 26: tmrwSecond & tmrwFirst roll to the top of Today (preserving their display order: tmrwSecond, tmrwFirst, then existingToday)
    const onNextDay = promoteTomorrowTasksLogic(
      [existingToday, tmrwFirst, tmrwSecond, futureTmrw],
      { mode: 'due_only', todayKey: '2026-11-26', now: 6000 }
    );
    expect(onNextDay.promotedCount).toBe(2);

    const openTodayTitles = onNextDay.nextTasks
      .filter((t) => !t.completed && t.bucket === 'today')
      .map((t) => t.title);
    expect(openTodayTitles).toEqual(['Tomorrow #2', 'Tomorrow #1', 'Leftover today task']);

    const remainingTomorrow = onNextDay.nextTasks.filter((t) => t.bucket === 'tomorrow');
    expect(remainingTomorrow.map((t) => t.title)).toEqual(['Future task']);
  });

  it('supports manual bulk Move all to Today and Defer all to Tomorrow while preserving order', () => {
    const todayA = createTaskRecord('Today A', 'today', [], { now: 1000 });
    const todayB = createTaskRecord('Today B', 'today', [todayA], { now: 2000 });
    const laterTask = createTaskRecord('Backlog', 'later', [todayA, todayB], { now: 3000 });

    const deferred = deferTodayTasksToTomorrowLogic([todayA, todayB, laterTask], {
      todayKey: '2026-11-25',
      tomorrowKey: '2026-11-26',
      now: 4000,
    });
    expect(deferred.changedTasks).toHaveLength(2);
    expect(
      deferred.nextTasks.filter((t) => t.bucket === 'tomorrow').map((t) => t.title)
    ).toEqual(['Today B', 'Today A']);
    expect(
      deferred.nextTasks.filter((t) => t.bucket === 'tomorrow').every((t) => t.scheduledForDateKey === '2026-11-26')
    ).toBe(true);

    const promoted = promoteTomorrowTasksLogic(deferred.nextTasks, {
      mode: 'all',
      todayKey: '2026-11-25',
      now: 5000,
    });
    expect(promoted.promotedCount).toBe(2);
    expect(promoted.nextTasks.filter((t) => t.bucket === 'today').map((t) => t.title)).toEqual([
      'Today B',
      'Today A',
    ]);
    expect(
      promoted.nextTasks.filter((t) => t.bucket === 'today').every((t) => t.scheduledForDateKey === undefined)
    ).toBe(true);
    expect(promoted.nextTasks.filter((t) => t.bucket === 'later').map((t) => t.title)).toEqual([
      'Backlog',
    ]);
  });

  it('marks an open task completed via matched brain dump log without duplicating log entries', () => {
    const task = createTaskRecord('Call dentist', 'today', [], { now: 1000 });
    const { nextTasks, updatedTask } = markTaskCompletedFromMatchedLog(
      [task],
      task.id,
      'log_ai_123',
      '2026-11-23',
      5000
    );

    expect(updatedTask?.completed).toBe(true);
    expect(updatedTask?.linkedLogEntryId).toBe('log_ai_123');
    expect(nextTasks[0].completedDateKey).toBe('2026-11-23');
  });
});
