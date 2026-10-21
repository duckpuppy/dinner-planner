import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkOllamaHealth,
  extractRecipeFromText,
  extractRecipeFromTextDetailed,
  RECIPE_FORMAT_SCHEMA,
  resetOllamaFormatCompat,
} from '../ollama.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  resetOllamaFormatCompat();
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
    expect(callBody.format).toEqual(RECIPE_FORMAT_SCHEMA);
    expect(callBody.stream).toBe(false);
  });

  it('returns null when response field is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });
    const result = await extractRecipeFromText('text', 'http://localhost:11434', 'gemma4-e4b');
    expect(result).toBeNull();
  });

  it('returns null on HTTP 4xx from Ollama without retrying', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve('model not found'),
    });
    const result = await extractRecipeFromText('text', 'http://localhost:11434', 'gemma4-e4b');
    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns null on network timeout (AbortError)', async () => {
    const abortErr = new DOMException('The operation was aborted', 'AbortError');
    mockFetch.mockRejectedValue(abortErr);
    const result = await extractRecipeFromTextDetailed(
      'text',
      'http://localhost:11434',
      'gemma4-e4b',
      { retryDelaysMs: [0, 0] }
    );
    expect(result.recipe).toBeNull();
  });

  it('coerces an unknown type to main instead of rejecting the response', async () => {
    mockFetch.mockResolvedValueOnce(makeGenerateResponse({ ...VALID_RECIPE, type: 'dessert' }));
    const result = await extractRecipeFromText('text', 'http://localhost:11434', 'gemma4-e4b');
    expect(result?.type).toBe('main');
  });

  it('tolerates ingredients with missing fields', async () => {
    mockFetch.mockResolvedValueOnce(
      makeGenerateResponse({ ...VALID_RECIPE, ingredients: [{ name: 'salt' }] })
    );
    const result = await extractRecipeFromText('text', 'http://localhost:11434', 'gemma4-e4b');
    expect(result?.ingredients).toEqual([
      { quantity: null, unit: null, name: 'salt', notes: null, category: 'Other', storeIds: [] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Outcome split: malformed vs valid-but-empty
// ---------------------------------------------------------------------------
describe('extractRecipeFromTextDetailed output handling', () => {
  const URL_ = 'http://localhost:11434';
  const noDelay = { retryDelaysMs: [0, 0] };
  const rawResponse = (response: string) => ({
    ok: true,
    json: () => Promise.resolve({ response }),
  });

  it('accepts instructions: null when the recipe has ingredients (usable, normalised)', async () => {
    mockFetch.mockResolvedValueOnce(makeGenerateResponse({ ...VALID_RECIPE, instructions: null }));
    const result = await extractRecipeFromTextDetailed('text', URL_, 'm', noDelay);
    expect(result.recipe?.instructions).toBe('');
    expect(result.error).toBeNull();
    expect(result.notUsable).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('normalises float and zero times', async () => {
    mockFetch.mockResolvedValueOnce(
      makeGenerateResponse({ ...VALID_RECIPE, prepTime: 7.5, cookTime: 0, servings: 4.2 })
    );
    const result = await extractRecipeFromTextDetailed('text', URL_, 'm', noDelay);
    expect(result.recipe).toMatchObject({ prepTime: 8, cookTime: null, servings: 4 });
  });

  it('reports a valid but empty object as notUsable without retrying', async () => {
    mockFetch.mockResolvedValue(makeGenerateResponse({}));
    const result = await extractRecipeFromTextDetailed('text', URL_, 'm', noDelay);
    expect(result).toEqual({
      recipe: null,
      error: 'No recipe found in this post.',
      notUsable: true,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('treats the reported all-null model output as notUsable (not unreadable)', async () => {
    mockFetch.mockResolvedValue(
      makeGenerateResponse({ ...VALID_RECIPE, name: 'Reel', ingredients: [], instructions: null })
    );
    const result = await extractRecipeFromTextDetailed('text', URL_, 'm', noDelay);
    expect(result.notUsable).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    'No detailed instructions provided in the text.',
    'Not specified',
    'N/A',
    'Instructions not provided.',
  ])('treats placeholder instructions %j with no ingredients as notUsable', async (p) => {
    mockFetch.mockResolvedValue(
      makeGenerateResponse({
        ...VALID_RECIPE,
        name: 'Homemade McRibs',
        ingredients: [],
        instructions: p,
      })
    );
    const result = await extractRecipeFromTextDetailed('text', URL_, 'm', noDelay);
    expect(result.notUsable).toBe(true);
    expect(result.recipe).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns a recipe with a blank name when it has ingredients', async () => {
    mockFetch.mockResolvedValueOnce(makeGenerateResponse({ ...VALID_RECIPE, name: '' }));
    const result = await extractRecipeFromTextDetailed('text', URL_, 'm', noDelay);
    expect(result.recipe?.name).toBe('');
    expect(result.recipe?.ingredients).toHaveLength(2);
    expect(result.notUsable).toBeUndefined();
  });

  it('treats a blank name with no ingredients or instructions as notUsable', async () => {
    mockFetch.mockResolvedValue(
      makeGenerateResponse({ ...VALID_RECIPE, name: '', ingredients: [], instructions: '' })
    );
    const result = await extractRecipeFromTextDetailed('text', URL_, 'm', noDelay);
    expect(result.notUsable).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries non-JSON output once, then fails with the unreadable message', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch.mockResolvedValue(rawResponse('not valid json {{{'));
    const result = await extractRecipeFromTextDetailed('text', URL_, 'm', noDelay);
    expect(result.recipe).toBeNull();
    expect(result.notUsable).toBeUndefined();
    expect(result.error).toBe("The AI model's response couldn't be read as a recipe");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('recovers when the retry after non-JSON output is valid', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch
      .mockResolvedValueOnce(rawResponse('oops'))
      .mockResolvedValueOnce(makeGenerateResponse(VALID_RECIPE));
    const result = await extractRecipeFromTextDetailed('text', URL_, 'm', noDelay);
    expect(result.recipe?.name).toBe('Pasta Carbonara');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('retries JSON that is not an object (e.g. an array) once, then fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch.mockResolvedValue(rawResponse('[1,2,3]'));
    const result = await extractRecipeFromTextDetailed('text', URL_, 'm', noDelay);
    expect(result.recipe).toBeNull();
    expect(result.error).toBe("The AI model's response couldn't be read as a recipe");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// extractRecipeFromTextDetailed — retry/backoff and error body logging
// ---------------------------------------------------------------------------
describe('extractRecipeFromTextDetailed retries', () => {
  const URL_ = 'http://localhost:11434';
  const noDelay = { retryDelaysMs: [0, 0] };
  const serverError = (body = 'model runner crashed') => ({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    text: () => Promise.resolve(body),
  });

  it('retries a 500 and succeeds on the next attempt', async () => {
    mockFetch
      .mockResolvedValueOnce(serverError())
      .mockResolvedValueOnce(makeGenerateResponse(VALID_RECIPE));
    const result = await extractRecipeFromTextDetailed('text', URL_, 'm', noDelay);
    expect(result.recipe?.name).toBe('Pasta Carbonara');
    expect(result.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('maps an out-of-memory 500 to a distinct message, logs it, and retries', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const oomBody = '{"error":"llama-server startup failed ... cudaMalloc failed: out of memory"}';
    mockFetch
      .mockResolvedValueOnce(serverError(oomBody))
      .mockResolvedValueOnce(makeGenerateResponse(VALID_RECIPE));
    const ok = await extractRecipeFromTextDetailed('text', URL_, 'm', noDelay);
    expect(ok.recipe?.name).toBe('Pasta Carbonara');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const logged = warn.mock.calls.map((c) => String(c[0]));
    expect(logged.some((m) => m.includes('[ollama] model failed to start: out of memory'))).toBe(
      true
    );

    mockFetch.mockReset();
    mockFetch.mockResolvedValue(serverError(oomBody));
    const failed = await extractRecipeFromTextDetailed('text', URL_, 'm', noDelay);
    expect(failed.recipe).toBeNull();
    expect(failed.error).toBe('The AI model ran out of memory starting up. Try again in a minute.');
    expect(mockFetch).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it('uses the longer delay for the first retry after an OOM, the normal one otherwise', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, 'setTimeout');
    try {
      const oom = serverError('cudaMalloc failed: out of memory');
      mockFetch
        .mockResolvedValueOnce(oom)
        .mockResolvedValueOnce(makeGenerateResponse(VALID_RECIPE));
      let p = extractRecipeFromTextDetailed('text', URL_, 'm', { retryDelaysMs: [3000, 10000] });
      await vi.advanceTimersByTimeAsync(10000);
      expect((await p).recipe).not.toBeNull();
      expect(spy.mock.calls.some((c) => c[1] === 10000)).toBe(true);

      spy.mockClear();
      mockFetch
        .mockResolvedValueOnce(serverError())
        .mockResolvedValueOnce(makeGenerateResponse(VALID_RECIPE));
      p = extractRecipeFromTextDetailed('text', URL_, 'm', { retryDelaysMs: [3000, 10000] });
      await vi.advanceTimersByTimeAsync(3000);
      expect((await p).recipe).not.toBeNull();
      expect(spy.mock.calls.some((c) => c[1] === 10000)).toBe(false);
    } finally {
      spy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('retries a network error and succeeds', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(makeGenerateResponse(VALID_RECIPE));
    const result = await extractRecipeFromTextDetailed('text', URL_, 'm', noDelay);
    expect(result.recipe).not.toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after three 500s, returns null with a friendly error, and logs the body', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetch.mockResolvedValue(serverError('x'.repeat(900)));
    const result = await extractRecipeFromTextDetailed('text', URL_, 'm', noDelay);
    expect(result.recipe).toBeNull();
    expect(result.error).toBe('The AI model returned an error (HTTP 500)');
    expect(mockFetch).toHaveBeenCalledTimes(3);
    const logged = warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes('body='));
    expect(logged).toContain('500');
    // body truncated to ~500 chars
    expect(logged).toContain('x'.repeat(500));
    expect(logged).not.toContain('x'.repeat(501));
    warn.mockRestore();
  });

  it('bounds attempts on repeated network-level failures', async () => {
    mockFetch.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    const result = await extractRecipeFromTextDetailed('text', URL_, 'm', noDelay);
    expect(result.recipe).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('waits the default backoff (3s then 10s) between attempts', async () => {
    vi.useFakeTimers();
    try {
      mockFetch.mockResolvedValue(serverError());
      const p = extractRecipeFromTextDetailed('text', URL_, 'm');
      await vi.advanceTimersByTimeAsync(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(2999);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(9999);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect((await p).recipe).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
