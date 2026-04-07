import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkOllamaHealth, extractRecipeFromText } from '../services/ollama.js';

// ---------------------------------------------------------------------------
// fetch mock
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

const VALID_RECIPE_JSON = JSON.stringify({
  name: 'Test Pasta',
  description: 'A simple pasta dish.',
  type: 'main',
  ingredients: [
    { quantity: 500, unit: 'g', name: 'pasta', notes: null, category: 'Pantry', storeIds: [] },
  ],
  instructions: 'Boil pasta. Serve.',
  prepTime: 5,
  cookTime: 10,
  servings: 4,
  calories: 400,
  proteinG: 15,
  carbsG: 70,
  fatG: 5,
  sourceUrl: null,
  videoUrl: null,
  tags: ['italian'],
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// checkOllamaHealth
// ---------------------------------------------------------------------------

describe('checkOllamaHealth', () => {
  it('returns true when /api/tags responds 200', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { models: [] }));
    const result = await checkOllamaHealth('http://localhost:11434');
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/tags',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('returns false when /api/tags responds with non-200', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(503, {}));
    const result = await checkOllamaHealth('http://localhost:11434');
    expect(result).toBe(false);
  });

  it('returns false on connection refused (fetch throws)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));
    const result = await checkOllamaHealth('http://localhost:11434');
    expect(result).toBe(false);
  });

  it('returns false on timeout (AbortError)', async () => {
    const abortErr = new DOMException('The operation was aborted.', 'AbortError');
    mockFetch.mockRejectedValueOnce(abortErr);
    const result = await checkOllamaHealth('http://localhost:11434');
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractRecipeFromText
// ---------------------------------------------------------------------------

describe('extractRecipeFromText', () => {
  it('returns a validated ImportedRecipe on success', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { response: VALID_RECIPE_JSON }));

    const result = await extractRecipeFromText(
      'Title: Test Pasta\n\nBoil pasta and serve.',
      'http://localhost:11434',
      'gemma4-e4b'
    );

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Test Pasta');
    expect(result?.type).toBe('main');
    expect(result?.ingredients).toHaveLength(1);
    expect(result?.tags).toContain('italian');
  });

  it('injects empty storeIds when model omits them from ingredients', async () => {
    const recipeWithoutStoreIds = JSON.stringify({
      name: 'Simple Soup',
      description: 'A warm soup.',
      type: 'main',
      ingredients: [
        { quantity: 1, unit: 'can', name: 'tomatoes', notes: null, category: 'Pantry' },
      ],
      instructions: 'Heat and serve.',
      prepTime: null,
      cookTime: 15,
      servings: 2,
      calories: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      sourceUrl: null,
      videoUrl: null,
      tags: [],
    });

    mockFetch.mockResolvedValueOnce(makeResponse(200, { response: recipeWithoutStoreIds }));

    const result = await extractRecipeFromText('soup text', 'http://localhost:11434', 'gemma4-e4b');
    expect(result).not.toBeNull();
    expect(result?.ingredients[0].storeIds).toEqual([]);
  });

  it('returns null when model response is invalid JSON', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { response: 'This is not JSON at all.' }));

    const result = await extractRecipeFromText('some text', 'http://localhost:11434', 'gemma4-e4b');
    expect(result).toBeNull();
  });

  it('returns null when Zod validation fails', async () => {
    const invalidRecipe = JSON.stringify({ name: 'Bad', type: 'unknown_type' });
    mockFetch.mockResolvedValueOnce(makeResponse(200, { response: invalidRecipe }));

    const result = await extractRecipeFromText('text', 'http://localhost:11434', 'gemma4-e4b');
    expect(result).toBeNull();
  });

  it('returns null when /api/generate returns non-200', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(500, {}));
    const result = await extractRecipeFromText('text', 'http://localhost:11434', 'gemma4-e4b');
    expect(result).toBeNull();
  });

  it('returns null on timeout (AbortError)', async () => {
    const abortErr = new DOMException('The operation was aborted.', 'AbortError');
    mockFetch.mockRejectedValueOnce(abortErr);

    const result = await extractRecipeFromText('text', 'http://localhost:11434', 'gemma4-e4b');
    expect(result).toBeNull();
  });

  it('returns null on connection refused', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));
    const result = await extractRecipeFromText('text', 'http://localhost:11434', 'gemma4-e4b');
    expect(result).toBeNull();
  });

  it('returns null when response body has unexpected shape (no response field)', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { wrong: 'field' }));
    const result = await extractRecipeFromText('text', 'http://localhost:11434', 'gemma4-e4b');
    expect(result).toBeNull();
  });

  it('passes model name and prompt to /api/generate', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, { response: VALID_RECIPE_JSON }));

    await extractRecipeFromText('test text', 'http://localhost:11434', 'llama3');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/generate',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"model":"llama3"'),
      })
    );
  });
});
