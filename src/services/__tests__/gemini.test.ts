import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CATEGORIES, DEFAULT_GEMINI_MODEL, GEMINI_MODEL_PRESETS } from '../../types/models';
import {
  analyzeBrainDumpWithGemini,
  buildBrainDumpResponseSchema,
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

  it('builds responseSchema constrained to custom category enum', () => {
    const schema = buildBrainDumpResponseSchema(['Work', 'Fitness', 'Errands']);
    expect(schema.properties.completedActivities.items.properties.category.enum).toEqual([
      'Work',
      'Fitness',
      'Errands',
    ]);
    expect(schema.properties.unfinishedTasks.items.properties.category.enum).toEqual([
      'Work',
      'Fitness',
      'Errands',
    ]);
  });

  it('sanitizes invalid categories and unmatched task IDs in Gemini payload', () => {
    const raw = JSON.stringify({
      completedActivities: [
        { title: 'Finished design doc', category: 'Work', matchedOpenTaskId: 'task_1' },
        { title: 'Walked the dog', category: 'UnknownCat', matchedOpenTaskId: 'task_ghost' },
      ],
      unfinishedTasks: [
        { title: 'Pay water bill', suggestedBucket: 'today', category: 'Home' },
      ],
    });

    const parsed = parseGeminiBrainDumpPayload(
      raw,
      ['Work', 'Home'],
      new Set(['task_1'])
    );

    expect(parsed.completedActivities).toEqual([
      { title: 'Finished design doc', category: 'Work', matchedOpenTaskId: 'task_1' },
      { title: 'Walked the dog', category: 'Work', matchedOpenTaskId: null },
    ]);
    expect(parsed.unfinishedTasks).toEqual([
      { title: 'Pay water bill', suggestedBucket: 'today', category: 'Home' },
    ]);
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
});
