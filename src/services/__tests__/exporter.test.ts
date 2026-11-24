import { describe, expect, it } from 'vitest';
import { DEFAULT_CATEGORIES, LogEntry, TaskItem } from '../../types/models';
import { parseImportJson, serializeToJson, serializeToMarkdown } from '../exporter';

describe('exporter service', () => {
  const sampleTasks: TaskItem[] = [
    {
      id: 'task_1',
      title: 'Review pull request',
      bucket: 'today',
      completed: false,
      completedAt: null,
      completedDateKey: null,
      linkedLogEntryId: null,
      category: 'Work',
      order: -1,
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'task_2',
      title: 'Organize garage',
      bucket: 'later',
      completed: false,
      completedAt: null,
      completedDateKey: null,
      linkedLogEntryId: null,
      order: 0,
      createdAt: 900,
      updatedAt: 900,
    },
  ];

  const sampleLogs: LogEntry[] = [
    {
      id: 'log_1',
      dateKey: '2026-11-23',
      title: 'Ran 5k around the park',
      category: 'Health',
      source: 'brain_dump',
      linkedTaskId: null,
      createdAt: 5000,
      updatedAt: 5000,
    },
  ];

  it('formats a readable Markdown journal with Tasks Ahead and Daily Activity Log', () => {
    const md = serializeToMarkdown(sampleTasks, sampleLogs, new Date(2026, 10, 23, 12, 0, 0));
    expect(md).toContain('# Strike Export — 2026-11-23');
    expect(md).toContain('- [ ] Review pull request `Work`');
    expect(md).toContain('- [ ] Organize garage');
    expect(md).toContain('### 2026-11-23');
    expect(md).toContain('- **[Health]** Ran 5k around the park');
  });

  it('round-trips JSON export and import without data loss', () => {
    const json = serializeToJson(sampleTasks, sampleLogs, DEFAULT_CATEGORIES);
    const restored = parseImportJson(json);

    expect(restored.app).toBe('Strike');
    expect(restored.tasks).toEqual(sampleTasks);
    expect(restored.logs).toEqual(sampleLogs);
    expect(restored.categories).toEqual(DEFAULT_CATEGORIES);
  });
});
