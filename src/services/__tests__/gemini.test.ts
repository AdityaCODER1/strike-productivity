import { describe, expect, it, vi } from 'vitest';
import { getChapterById } from '../../data/ncertCatalog';
import { DEFAULT_CATEGORIES, DEFAULT_GEMINI_MODEL, GEMINI_MODEL_PRESETS } from '../../types/models';
import {
  analyzeBrainDumpWithGemini,
  buildBrainDumpResponseSchema,
  evaluateChapterCoverageWithGemini,
  explainDoubtWithGemini,
  extractDoubtFromImageWithGemini,
  parseGeminiBrainDumpPayload,
} from '../gemini';

describe('gemini service', () => {
  it('defaults to gemini-4-hydrogen and exposes expected model presets', () => {
    expect(DEFAULT_GEMINI_MODEL).toBe('gemini-4-hydrogen');
    expect(GEMINI_MODEL_PRESETS.map((p) => p.id)).toEqual([
      'gemini-4-hydrogen',
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
    ]);
  });

  it('builds responseSchema with custom category enum and explicitly nullable NCERT fields', () => {
    const schema = buildBrainDumpResponseSchema(['Work', 'Learning', 'Doubts']);
    expect(schema.properties.completedActivities.items.properties.category.enum).toEqual([
      'Work',
      'Learning',
      'Doubts',
    ]);
    expect(schema.properties.unfinishedTasks.items.properties.category.enum).toEqual([
      'Work',
      'Learning',
      'Doubts',
    ]);
    expect(schema.properties.completedActivities.items.properties.subjectId.nullable).toBe(true);
    expect(schema.properties.completedActivities.items.properties.chapterId.nullable).toBe(true);
    expect(schema.properties.unfinishedTasks.items.properties.subjectId.nullable).toBe(true);
    expect(schema.properties.unfinishedTasks.items.properties.chapterId.nullable).toBe(true);
    expect(schema.properties.doubts).toBeDefined();
  });

  it('sanitizes invalid categories, strips NCERT tags from non-study items, and preserves Learning/Doubt tags', () => {
    const raw = JSON.stringify({
      completedActivities: [
        {
          title: 'Finished design doc',
          category: 'Work',
          matchedOpenTaskId: 'task_1',
          subjectId: 'physics',
          chapterId: 'phy-12-ray-optics',
        },
        { title: 'Walked the dog', category: 'UnknownCat', matchedOpenTaskId: 'task_ghost' },
        {
          title: 'Solved Ray Optics NCERT exercises',
          category: 'Learning',
          matchedOpenTaskId: null,
          subjectId: 'physics',
          chapterId: 'phy-12-ray-optics',
        },
      ],
      unfinishedTasks: [
        { title: 'Pay water bill', suggestedBucket: 'today', category: 'Home' },
      ],
      doubts: [
        {
          title: 'Lens maker sign convention',
          questionText: 'Confused about R1 and R2 signs in concave-convex lens',
          subjectId: 'physics',
          chapterId: 'phy-12-ray-optics',
          pyqYear: 2021,
        },
      ],
    });

    const parsed = parseGeminiBrainDumpPayload(
      raw,
      ['Work', 'Home', 'Learning', 'Doubts'],
      new Set(['task_1'])
    );

    expect(parsed.completedActivities).toEqual([
      { title: 'Finished design doc', category: 'Work', matchedOpenTaskId: 'task_1' },
      { title: 'Walked the dog', category: 'Work', matchedOpenTaskId: null },
      {
        title: 'Solved Ray Optics NCERT exercises',
        category: 'Learning',
        matchedOpenTaskId: null,
        subjectId: 'physics',
        chapterId: 'phy-12-ray-optics',
      },
    ]);
    expect(parsed.unfinishedTasks).toEqual([
      { title: 'Pay water bill', suggestedBucket: 'today', category: 'Home' },
    ]);
    expect(parsed.doubts).toHaveLength(1);
    expect(parsed.doubts[0].chapterId).toBe('phy-12-ray-optics');
    expect(parsed.doubts[0].pyqYear).toBe(2021);
  });

  it('calls the Gemini v1beta endpoint with default gemini-4-hydrogen and structured schema', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    completedActivities: [
                      { title: 'Deployed PWA', category: 'Work', matchedOpenTaskId: 'task_a' },
                    ],
                    unfinishedTasks: [
                      { title: 'Order coffee beans', suggestedBucket: 'later', category: 'Home' },
                    ],
                    doubts: [],
                  }),
                },
              ],
            },
          },
        ],
      }),
    });

    const result = await analyzeBrainDumpWithGemini({
      apiKey: 'test-key-123',
      rawText: 'Deployed the pwa today, still gotta order coffee beans later',
      categories: DEFAULT_CATEGORIES,
      openTasks: [{ id: 'task_a', title: 'Deploy PWA', bucket: 'today' }],
      dateKey: '2026-11-23',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/models/gemini-4-hydrogen:generateContent');
    const body = JSON.parse(init.body as string);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.properties.completedActivities).toBeDefined();

    expect(result.completedActivities).toHaveLength(1);
    expect(result.completedActivities[0].matchedOpenTaskId).toBe('task_a');
    expect(result.unfinishedTasks[0].suggestedBucket).toBe('later');
  });

  it('evaluates holistic NCERT chapter coverage and clamps percentage between 0 and 100', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    coveragePercent: 112,
                    aiSummary: 'Theory, NCERT exercises, and 10 years of PYQs completed.',
                  }),
                },
              ],
            },
          },
        ],
      }),
    });

    const chapter = getChapterById('phy-12-current-electricity')!;
    const res = await evaluateChapterCoverageWithGemini({
      apiKey: 'test-key',
      chapter,
      completedLogs: [{ dateKey: '2026-11-23', title: 'Completed Kirchhoff laws & meter bridge' }],
      completedPyqYears: [2024, 2023, 2022],
      totalPyqYears: 14,
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(res.coveragePercent).toBe(100);
    expect(res.aiSummary).toContain('Theory');
  });

  it('sends inlineData for Gemini Vision PYQ extraction and returns structured doubt metadata', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    title: 'Equivalent resistance of bridge circuit',
                    questionText: 'Find the equivalent resistance between A and B. [NEET 2020]',
                    subjectId: 'physics',
                    chapterId: 'phy-12-current-electricity',
                    pyqYear: 2020,
                    hasVisualDiagram: true,
                  }),
                },
              ],
            },
          },
        ],
      }),
    });

    const extracted = await extractDoubtFromImageWithGemini({
      apiKey: 'test-key',
      imageBase64: 'AAAABBBB',
      imageMimeType: 'image/webp',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[1].inlineData).toEqual({
      mimeType: 'image/webp',
      data: 'AAAABBBB',
    });
    expect(extracted.chapterId).toBe('phy-12-current-electricity');
    expect(extracted.pyqYear).toBe(2020);
    expect(extracted.hasVisualDiagram).toBe(true);
  });

  it('requests step-by-step NCERT explanation for a doubt', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: '1. Apply Wheatstone balance condition R1/R2 = R3/R4.' }],
            },
          },
        ],
      }),
    });

    const explanation = await explainDoubtWithGemini({
      apiKey: 'test-key',
      subjectName: 'Physics',
      chapterTitle: 'Current Electricity',
      classLevel: 12,
      title: 'Balanced bridge',
      questionText: 'Why is current through galvanometer zero?',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(explanation).toContain('Wheatstone');
  });
});
