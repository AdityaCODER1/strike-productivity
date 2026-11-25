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

  it('exports and restores v2 NCERT chapterProgress, doubts, and studySettings', () => {
    const extras = {
      chapterProgress: {
        'phy-12-ray-optics': {
          chapterId: 'phy-12-ray-optics',
          subjectId: 'physics' as const,
          coveragePercent: 65,
          coverageSource: 'ai' as const,
          aiSummary: 'Covered reflection & refraction; optical instruments left.',
          completedPyqYears: [2024, 2023],
          updatedAt: 9000,
        },
      },
      doubts: [
        {
          id: 'doubt_1',
          subjectId: 'physics' as const,
          chapterId: 'phy-12-ray-optics',
          title: 'TIR critical angle',
          questionText: 'Find critical angle when μ = √2',
          imageDataUrl: null,
          pyqYear: 2022,
          status: 'open' as const,
          resolutionNote: 'sin C = 1/μ = 1/√2 => 45°',
          source: 'manual' as const,
          createdAt: 8000,
          updatedAt: 8000,
        },
      ],
      studySettings: {
        showArchivedNcert: true,
        pyqYearStart: 2015,
        pyqYearEnd: 2026,
      },
    };

    const json = serializeToJson(
      sampleTasks,
      sampleLogs,
      DEFAULT_CATEGORIES,
      new Date(2026, 10, 23, 12, 0, 0),
      extras
    );
    const restored = parseImportJson(json);

    expect(restored.version).toBe(2);
    expect(restored.chapterProgress?.['phy-12-ray-optics'].coveragePercent).toBe(65);
    expect(restored.chapterProgress?.['phy-12-ray-optics'].completedPyqYears).toEqual([2024, 2023]);
    expect(restored.doubts).toHaveLength(1);
    expect(restored.doubts?.[0].pyqYear).toBe(2022);
    expect(restored.studySettings).toEqual(extras.studySettings);

    const md = serializeToMarkdown(
      sampleTasks,
      sampleLogs,
      new Date(2026, 10, 23, 12, 0, 0),
      extras
    );
    expect(md).toContain('## NCERT Chapter Progress');
    expect(md).toContain('Ray Optics and Optical Instruments**: 65% · PYQs: 2024, 2023');
    expect(md).toContain('## Doubts Archive');
    expect(md).toContain('TIR critical angle');
  });

  it('exports and restores v3 mistakes and cached chapter AI summaries in JSON and Markdown', () => {
    const extras = {
      chapterProgress: {
        'chem-12-solutions': {
          chapterId: 'chem-12-solutions',
          subjectId: 'chemistry' as const,
          coveragePercent: 55,
          coverageSource: 'ai' as const,
          completedPyqYears: [2024],
          mistakesSummaryAi: 'Always multiply colligative formulas by Van’t Hoff factor i.',
          mistakesSummaryUpdatedAt: 9500,
          mistakesSummaryCount: 1,
          doubtsSummaryAi: 'Review Raoult law positive vs negative deviation examples.',
          doubtsSummaryUpdatedAt: 9600,
          doubtsSummaryCount: 1,
          updatedAt: 9600,
        },
      },
      mistakes: [
        {
          id: 'mistake_1',
          subjectId: 'chemistry' as const,
          chapterId: 'chem-12-solutions',
          title: "Forgot Van't Hoff factor for K₂SO₄",
          mistakeText: 'Used i=1 instead of i=3 for dilute K₂SO₄ osmotic pressure',
          correctionNote: 'K₂SO₄ → 2K⁺ + SO₄²⁻ gives i = 3 for complete dissociation',
          mistakeType: 'formula' as const,
          sourceLabel: 'Mock #4',
          status: 'active' as const,
          repeatCount: 2,
          lastRepeatedAt: 9100,
          source: 'brain_dump' as const,
          createdAt: 8500,
          updatedAt: 9100,
        },
      ],
    };

    const json = serializeToJson(
      sampleTasks,
      sampleLogs,
      DEFAULT_CATEGORIES,
      new Date(2026, 10, 23, 12, 0, 0),
      extras
    );
    const restored = parseImportJson(json);

    expect(restored.version).toBe(3);
    expect(restored.mistakes).toHaveLength(1);
    expect(restored.mistakes?.[0].mistakeType).toBe('formula');
    expect(restored.mistakes?.[0].repeatCount).toBe(2);
    expect(restored.mistakes?.[0].sourceLabel).toBe('Mock #4');
    expect(restored.chapterProgress?.['chem-12-solutions'].mistakesSummaryAi).toContain(
      'Van’t Hoff factor'
    );
    expect(restored.chapterProgress?.['chem-12-solutions'].doubtsSummaryAi).toContain(
      'Raoult law'
    );

    const md = serializeToMarkdown(
      sampleTasks,
      sampleLogs,
      new Date(2026, 10, 23, 12, 0, 0),
      extras
    );
    expect(md).toContain('## Mistake Log');
    expect(md).toContain('### Chemistry Cl.12 — Solutions');
    expect(md).toContain("Forgot Van't Hoff factor for K₂SO₄");
    expect(md).toContain('Repeated 2x');
    expect(md).toContain('[Mock #4]');
    expect(md).toContain('Rule / Fix: K₂SO₄ → 2K⁺ + SO₄²⁻');
  });
});
