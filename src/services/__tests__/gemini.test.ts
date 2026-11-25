import { describe, expect, it, vi } from 'vitest';
import { getChapterById } from '../../data/ncertCatalog';
import { DEFAULT_CATEGORIES, DEFAULT_GEMINI_MODEL, GEMINI_MODEL_PRESETS } from '../../types/models';
import {
  analyzeBrainDumpWithGemini,
  buildBrainDumpPrompt,
  buildBrainDumpResponseSchema,
  evaluateChapterCoverageWithGemini,
  explainDoubtWithGemini,
  extractDoubtFromImageWithGemini,
  extractMistakesFromTextWithGemini,
  parseGeminiBrainDumpPayload,
  summarizeChapterItemsWithGemini,
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

  it('extracts and sanitizes NCERT-tagged mistakes from Brain Dump payloads and supports mistake focusMode', () => {
    const schema = buildBrainDumpResponseSchema(['Learning', 'Doubts', 'Mistakes']);
    expect(schema.properties.mistakes).toBeDefined();

    const mistakePrompt = buildBrainDumpPrompt(
      'Mock 4: forgot i=3 for K2SO4',
      ['Learning', 'Mistakes'],
      [],
      '2026-11-25',
      false,
      'mistakes'
    );
    expect(mistakePrompt).toContain('mistake-analysis assistant');
    expect(mistakePrompt).toContain('Leave completedActivities and unfinishedTasks empty');

    const raw = JSON.stringify({
      completedActivities: [
        {
          title: 'Misread incorrect option in Plant Kingdom',
          category: 'Mistakes',
          matchedOpenTaskId: null,
          subjectId: 'biology',
          chapterId: 'bio-11-plant-kingdom',
        },
      ],
      unfinishedTasks: [],
      doubts: [],
      mistakes: [
        {
          title: 'Wrong sign in mirror formula',
          mistakeText: 'Took focal length of concave mirror as positive',
          correctionNote: 'Concave mirror has negative f by Cartesian sign convention',
          mistakeType: 'invalid_type',
          subjectId: 'physics',
          chapterId: 'phy-12-ray-optics',
          sourceLabel: 'Mock #3',
        },
      ],
    });

    const parsed = parseGeminiBrainDumpPayload(raw, ['Learning', 'Mistakes'], new Set());
    expect(parsed.mistakes).toHaveLength(2);
    expect(parsed.mistakes[0]).toMatchObject({
      title: 'Wrong sign in mirror formula',
      mistakeType: 'conceptual',
      chapterId: 'phy-12-ray-optics',
      sourceLabel: 'Mock #3',
    });
    expect(parsed.mistakes[1]).toMatchObject({
      title: 'Misread incorrect option in Plant Kingdom',
      chapterId: 'bio-11-plant-kingdom',
    });
  });

  it('parses multiple raw mistake notes with extractMistakesFromTextWithGemini', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    mistakes: [
                      {
                        title: 'Forgot Van’t Hoff factor',
                        mistakeText: 'Used i=1 for K2SO4',
                        correctionNote: 'i = 3 for dilute K2SO4',
                        mistakeType: 'formula',
                        subjectId: 'chemistry',
                        chapterId: 'chem-12-solutions',
                        sourceLabel: 'Mock #5',
                      },
                      {
                        title: 'Confused bryophyte sporophyte dependence',
                        mistakeText: 'Marked sporophyte as independent in mosses',
                        correctionNote: 'In bryophytes, sporophyte is attached to photosynthetic gametophyte',
                        mistakeType: 'ncert_trap',
                        subjectId: 'biology',
                        chapterId: 'bio-11-plant-kingdom',
                        sourceLabel: null,
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    });

    const items = await extractMistakesFromTextWithGemini({
      apiKey: 'test-key',
      rawText: 'Mock 5: forgot i=3 for K2SO4 and marked moss sporophyte independent',
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(items).toHaveLength(2);
    expect(items[0].mistakeType).toBe('formula');
    expect(items[0].sourceLabel).toBe('Mock #5');
    expect(items[1].mistakeType).toBe('ncert_trap');
    expect(items[1].sourceLabel).toBeUndefined();
  });

  it('generates per-chapter revision summaries for both Mistakes and Doubts', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: 'Mistakes summary: Check Cartesian sign conventions.' }] },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: 'Doubts summary: Review prism minimum deviation.' }] },
            },
          ],
        }),
      });

    const chapter = getChapterById('phy-12-ray-optics')!;
    const mistakeSummary = await summarizeChapterItemsWithGemini({
      apiKey: 'test-key',
      chapter,
      scope: 'mistakes',
      mistakes: [
        {
          id: 'm1',
          subjectId: 'physics',
          chapterId: chapter.id,
          title: 'Lens sign slip',
          mistakeText: 'Flipped R2 sign',
          correctionNote: 'R2 < 0 for biconvex lens',
          mistakeType: 'silly',
          status: 'active',
          repeatCount: 3,
          source: 'manual',
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    const doubtSummary = await summarizeChapterItemsWithGemini({
      apiKey: 'test-key',
      chapter,
      scope: 'doubts',
      doubts: [
        {
          id: 'd1',
          subjectId: 'physics',
          chapterId: chapter.id,
          title: 'Minimum deviation angle',
          questionText: 'When does i = e happen in a prism?',
          status: 'open',
          resolutionNote: 'At minimum deviation δm, r1 = r2 = A/2',
          source: 'manual',
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      fetchImpl: mockFetch as unknown as typeof fetch,
    });

    expect(mistakeSummary).toContain('Cartesian sign conventions');
    expect(doubtSummary).toContain('prism minimum deviation');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
