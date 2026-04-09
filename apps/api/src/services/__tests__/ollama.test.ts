import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkOllamaHealth, extractRecipeFromText } from '../ollama.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// checkOllamaHealth
// ---------------------------------------------------------------------------
describe('checkOllamaHealth', () => {
  it('returns { available: true, models } when /api/tags responds ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ models: [{ name: 'llama3' }, { name: 'gemma2' }] }),
    });
    const result = await checkOllamaHealth('http://localhost:11434');
    expect(result).toEqual({ available: true, models: ['llama3', 'gemma2'] });
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/tags', expect.any(Object));
  });

  it('returns { available: true, models: [] } when models field is absent', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });
    const result = await checkOllamaHealth('http://localhost:11434');
    expect(result).toEqual({ available: true, models: [] });
  });

  it('returns { available: false, models: [] } when /api/tags responds not ok', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const result = await checkOllamaHealth('http://localhost:11434');
    expect(result).toEqual({ available: false, models: [] });
  });

  it('returns { available: false, models: [] } on network/connection error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await checkOllamaHealth('http://localhost:11434');
    expect(result).toEqual({ available: false, models: [] });
  });

  it('returns { available: false, models: [] } on AbortError (timeout)', async () => {
    const abortErr = new DOMException('The operation was aborted', 'AbortError');
    mockFetch.mockRejectedValueOnce(abortErr);
    const result = await checkOllamaHealth('http://localhost:11434');
    expect(result).toEqual({ available: false, models: [] });
  });
});

// ---------------------------------------------------------------------------
// extractRecipeFromText
// ---------------------------------------------------------------------------

const VALID_RECIPE = {
  name: 'Pasta Carbonara',
  description: 'A classic Roman pasta dish.',
  type: 'main' as const,
  ingredients: [
    {
      quantity: 200,
      unit: 'g',
      name: 'spaghetti',
      notes: null,
      category: 'Pantry',
    },
    {
      quantity: 100,
      unit: 'g',
      name: 'pancetta',
      notes: null,
      category: 'Meat',
    },
  ],
  instructions: 'Cook pasta. Mix eggs, cheese. Combine.',
  prepTime: 10,
  cookTime: 20,
  servings: 2,
  calories: 500,
  proteinG: 25,
  carbsG: 60,
  fatG: 18,
  sourceUrl: null,
  videoUrl: null,
  tags: ['italian', 'pasta'],
};

function makeGenerateResponse(responseJson: unknown) {
  return {
    ok: true,
    json: () => Promise.resolve({ response: JSON.stringify(responseJson) }),
  };
}

describe('extractRecipeFromText', () => {
  it('returns parsed recipe on valid Ollama response', async () => {
    mockFetch.mockResolvedValueOnce(makeGenerateResponse(VALID_RECIPE));
    const result = await extractRecipeFromText('some text', 'http://localhost:11434', 'gemma4-e4b');
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Pasta Carbonara');
    expect(result?.type).toBe('main');
    expect(result?.ingredients).toHaveLength(2);
  });

  it('calls /api/generate with correct body', async () => {
    mockFetch.mockResolvedValueOnce(makeGenerateResponse(VALID_RECIPE));
    await extractRecipeFromText('recipe text', 'http://localhost:11434', 'llama3');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/generate',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"model":"llama3"'),
      })
    );
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(callBody.format).toBe('json');
    expect(callBody.stream).toBe(false);
  });

  it('returns null on invalid JSON in response field', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ response: 'not valid json {{{' }),
    });
    const result = await extractRecipeFromText('text', 'http://localhost:11434', 'gemma4-e4b');
    expect(result).toBeNull();
  });

  it('returns null when response field is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });
    const result = await extractRecipeFromText('text', 'http://localhost:11434', 'gemma4-e4b');
    expect(result).toBeNull();
  });

  it('returns null on HTTP error from Ollama', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    const result = await extractRecipeFromText('text', 'http://localhost:11434', 'gemma4-e4b');
    expect(result).toBeNull();
  });

  it('returns null on network timeout (AbortError)', async () => {
    const abortErr = new DOMException('The operation was aborted', 'AbortError');
    mockFetch.mockRejectedValueOnce(abortErr);
    const result = await extractRecipeFromText('text', 'http://localhost:11434', 'gemma4-e4b');
    expect(result).toBeNull();
  });

  it('returns null when recipe fails schema validation', async () => {
    const invalidRecipe = { ...VALID_RECIPE, type: 'dessert' }; // invalid enum value
    mockFetch.mockResolvedValueOnce(makeGenerateResponse(invalidRecipe));
    const result = await extractRecipeFromText('text', 'http://localhost:11434', 'gemma4-e4b');
    expect(result).toBeNull();
  });

  it('returns null when ingredients are missing required fields', async () => {
    const badIngredients = { ...VALID_RECIPE, ingredients: [{ name: 'salt' }] }; // missing category
    mockFetch.mockResolvedValueOnce(makeGenerateResponse(badIngredients));
    const result = await extractRecipeFromText('text', 'http://localhost:11434', 'gemma4-e4b');
    expect(result).toBeNull();
  });
});
