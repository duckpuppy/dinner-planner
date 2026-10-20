import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../settings.js', () => ({ getSettings: vi.fn() }));

import { getSettings } from '../settings.js';
import { extractRecipeFromMetadata } from '../recipeExtraction.js';

// Real ollama.ts; only fetch is faked. Placeholder model output must end as 'no_recipe'.
describe('extractRecipeFromMetadata with placeholder model output', () => {
  beforeEach(() => {
    vi.mocked(getSettings).mockResolvedValue({
      llmMode: 'direct',
      ollamaUrl: 'http://localhost:11434',
      ollamaModel: 'm',
    } as never);
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports no_recipe for the "Homemade McRibs" junk response', async () => {
    const junk = {
      name: 'Homemade McRibs',
      description: null,
      type: 'main',
      ingredients: [],
      instructions: 'No detailed instructions provided in the text.',
      tags: ['American', 'Dinner'],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ response: JSON.stringify(junk), eval_count: 89 }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await extractRecipeFromMetadata({
      title: 'Homemade McRibs',
      description: 'Homemade McRibs for dinner tonight',
    });
    expect(r.status).toBe('no_recipe');
    expect(r.recipe).toBeNull();
    expect(r.source).toBe('none');
  });
});
