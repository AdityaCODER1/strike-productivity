import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES } from '../../types/models';
import {
  createTaskRecord,
  markTaskCompletedFromMatchedLog,
  moveTaskBucketLogic,
  toggleTaskCompletionLogic,
} from '../taskLogLogic';

describe('taskLogLogic', () => {
  it('creates tasks in Today or Later buckets with descending order for top insertion', () => {
    const first = createTaskRecord('Ship v1', 'today', [], { now: 1000 });
    const second = createTaskRecord('Buy groceries', 'later', [first], { now: 2000 });

    expect(first.bucket).toBe('today');
    expect(second.bucket).toBe('later');
    expect(second.order).toBeLessThan(first.order);
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

  it('moves tasks cleanly between Today and Later buckets', () => {
    const task = createTaskRecord('Plan weekend trip', 'later', [], { now: 1000 });
    const moved = moveTaskBucketLogic([task], task.id, 'today', 2000);
    expect(moved.updatedTask?.bucket).toBe('today');
    expect(moved.nextTasks[0].bucket).toBe('today');
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
