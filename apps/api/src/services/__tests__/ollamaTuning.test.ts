import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractRecipeFromTextDetailed,
  fitTextToContext,
  RECIPE_FORMAT_SCHEMA,
  resetOllamaFormatCompat,
} from '../ollama.js';
import { getOllamaKeepAlive, getOllamaNumCtx, getOllamaTemperature } from '../ollamaConfig.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const URL_ = 'http://localhost:11434';
const RECIPE = {
  name: 'Soup',
  description: 'Warm',
  type: 'main',
  ingredients: [{ quantity: 1, unit: 'cup', name: 'water', notes: null, category: 'Other' }],
  instructions: 'Boil.',
  tags: [],
};

const generateOk = (extra: Record<string, unknown> = {}, recipe: unknown = RECIPE) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve({ response: JSON.stringify(recipe), ...extra }),
});
const bad400 = (body: string) => ({
  ok: false,
  status: 400,
  statusText: 'Bad Request',
  text: () => Promise.resolve(body),
});
const bodyOf = (call: number) => JSON.parse(mockFetch.mock.calls[call][1].body as string);
const infoLines = () => vi.mocked(console.info).mock.calls.map((c) => String(c[0]));
const warnLines = () => vi.mocked(console.warn).mock.calls.map((c) => String(c[0]));

const ENV_KEYS = ['OLLAMA_NUM_CTX', 'OLLAMA_KEEP_ALIVE', 'OLLAMA_TEMPERATURE'];

beforeEach(() => {
  mockFetch.mockReset();
  resetOllamaFormatCompat();
  for (const k of ENV_KEYS) delete process.env[k];
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('ollama config', () => {
  it('has defaults', () => {
    expect(getOllamaNumCtx()).toBe(8192);
    expect(getOllamaKeepAlive()).toBe('30m');
    expect(getOllamaTemperature()).toBe(0);
  });

  it('reads overrides lazily and ignores invalid values', () => {
    process.env.OLLAMA_NUM_CTX = '16384';
    process.env.OLLAMA_KEEP_ALIVE = '-1';
    process.env.OLLAMA_TEMPERATURE = '0.3';
    expect(getOllamaNumCtx()).toBe(16384);
    expect(getOllamaKeepAlive()).toBe(-1);
    expect(getOllamaTemperature()).toBe(0.3);
    process.env.OLLAMA_NUM_CTX = 'abc';
    process.env.OLLAMA_TEMPERATURE = '-2';
    process.env.OLLAMA_KEEP_ALIVE = '1h';
    expect(getOllamaNumCtx()).toBe(8192);
    expect(getOllamaTemperature()).toBe(0);
    expect(getOllamaKeepAlive()).toBe('1h');
  });
});

describe('request body', () => {
  it('sends options, keep_alive and the schema format', async () => {
    mockFetch.mockResolvedValueOnce(generateOk());
    await extractRecipeFromTextDetailed('text', URL_, 'm');
    const body = bodyOf(0);
    expect(body.options).toEqual({ temperature: 0, num_ctx: 8192 });
    expect(body.keep_alive).toBe('30m');
    expect(body.format).toEqual(RECIPE_FORMAT_SCHEMA);
    expect(body.format.properties.instructions.type).toEqual(['string', 'null']);
    expect(body.format.properties.type.enum).toEqual(['main', 'side', 'both']);
  });

  it('honours env overrides', async () => {
    process.env.OLLAMA_NUM_CTX = '4096';
    process.env.OLLAMA_KEEP_ALIVE = '5m';
    process.env.OLLAMA_TEMPERATURE = '0.2';
    mockFetch.mockResolvedValueOnce(generateOk());
    await extractRecipeFromTextDetailed('text', URL_, 'm');
    const body = bodyOf(0);
    expect(body.options).toEqual({ temperature: 0.2, num_ctx: 4096 });
    expect(body.keep_alive).toBe('5m');
  });
});

describe('schema format fallback', () => {
  it('falls back to "json" on a 400 mentioning format, and remembers it', async () => {
    mockFetch
      .mockResolvedValueOnce(bad400('{"error":"invalid format: expected \\"json\\""}'))
      .mockResolvedValueOnce(generateOk())
      .mockResolvedValueOnce(generateOk());
    const first = await extractRecipeFromTextDetailed('text', URL_, 'm');
    expect(first.recipe?.name).toBe('Soup');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(bodyOf(0).format).toEqual(RECIPE_FORMAT_SCHEMA);
    expect(bodyOf(1).format).toBe('json');

    await extractRecipeFromTextDetailed('text', URL_, 'm');
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(bodyOf(2).format).toBe('json');

    expect(warnLines().filter((w) => w.includes('rejected'))).toHaveLength(1);
  });

  it('does not fall back on an unrelated 400 (still fatal)', async () => {
    mockFetch.mockResolvedValueOnce(bad400('model not found'));
    const result = await extractRecipeFromTextDetailed('text', URL_, 'm');
    expect(result.recipe).toBeNull();
    expect(result.error).toContain('HTTP 400');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('timing log', () => {
  it('logs one structured line with ms-converted durations', async () => {
    mockFetch.mockResolvedValueOnce(
      generateOk({
        total_duration: 2_500_000_000,
        load_duration: 1_200_000_000,
        prompt_eval_count: 321,
        eval_count: 99,
      })
    );
    await extractRecipeFromTextDetailed('the secret prompt text', URL_, 'gemma4-e4b');
    const info = infoLines();
    expect(info).toHaveLength(1);
    const line = info[0];
    expect(line).toContain('model=gemma4-e4b');
    expect(line).toContain('input_chars=22');
    expect(line).toContain('total_ms=2500');
    expect(line).toContain('load_ms=1200');
    expect(line).toContain('prompt_eval_count=321');
    expect(line).toContain('eval_count=99');
    expect(line).toContain('attempt=1');
    expect(line).toContain('outcome=ok');
    expect(line).not.toContain('secret prompt');
  });

  it('reports not_usable and invalid outcomes with attempt numbers', async () => {
    mockFetch.mockResolvedValueOnce(
      generateOk({}, { name: '', ingredients: [], instructions: null })
    );
    await extractRecipeFromTextDetailed('t', URL_, 'm');
    expect(infoLines()[0]).toContain('outcome=not_usable');

    vi.mocked(console.info).mockClear();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ response: 'not json' }),
      })
      .mockResolvedValueOnce(generateOk());
    await extractRecipeFromTextDetailed('t', URL_, 'm', { retryDelaysMs: [0, 0] });
    const lines = infoLines();
    expect(lines[0]).toContain('attempt=1');
    expect(lines[0]).toContain('outcome=invalid');
    expect(lines[1]).toContain('attempt=2');
    expect(lines[1]).toContain('outcome=ok');
  });

  it('warns when prompt_eval_count >= 90% of num_ctx', async () => {
    process.env.OLLAMA_NUM_CTX = '1000';
    mockFetch.mockResolvedValueOnce(generateOk({ prompt_eval_count: 900 }));
    await extractRecipeFromTextDetailed('t', URL_, 'm');
    expect(warnLines().some((w) => w.includes('probably truncated'))).toBe(true);
  });

  it('does not warn below the threshold', async () => {
    process.env.OLLAMA_NUM_CTX = '1000';
    mockFetch.mockResolvedValueOnce(generateOk({ prompt_eval_count: 899 }));
    await extractRecipeFromTextDetailed('t', URL_, 'm');
    expect(warnLines().some((w) => w.includes('probably truncated'))).toBe(false);
  });

  it('logs elapsed ms on timeout', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementationOnce(
      (_u: string, init: { signal: AbortSignal }) =>
        new Promise((_res, rej) => {
          init.signal.addEventListener('abort', () =>
            rej(new DOMException('aborted', 'AbortError'))
          );
        })
    );
    const pending = extractRecipeFromTextDetailed('t', URL_, 'm');
    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pending;
    expect(result.error).toContain('too long');
    expect(warnLines().some((w) => /timed out after \d+ms/.test(w))).toBe(true);
  });
});

describe('fitTextToContext', () => {
  // num_ctx 1000 -> budget floor(0.85 * 1000 * 3.5) = 2975 chars
  const title = 'TITLE LINE';
  const desc = 'd'.repeat(500);
  const transcript = `Video transcript:\n${'t'.repeat(1500)}`;
  const comments = `Video comments (the uploader's own comments first):\n${'c'.repeat(1500)}`;

  it('is a no-op when within budget', () => {
    const text = [title, desc].join('\n\n');
    expect(fitTextToContext(text, 1000)).toEqual({
      text,
      trimmed: false,
      originalChars: text.length,
    });
  });

  it('trims comments first, leaving the transcript intact', () => {
    const text = [title, desc, transcript, comments].join('\n\n');
    const r = fitTextToContext(text, 1000);
    expect(r.trimmed).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(2975);
    expect(r.text).toContain(transcript);
    expect(r.text).toContain('Video comments');
    expect(r.text.length).toBeLessThan(text.length);
  });

  it('drops comments, then trims the transcript, before touching the description', () => {
    const big = `Video transcript:\n${'t'.repeat(3500)}`;
    const text = [title, desc, big, comments].join('\n\n');
    const r = fitTextToContext(text, 1000);
    expect(r.text).not.toContain('Video comments');
    expect(r.text).toContain('Video transcript:');
    expect(r.text).toContain(`${title}\n\n${desc}`);
    expect(r.text.length).toBeLessThanOrEqual(2975);
  });

  it('cuts the description tail only after dropping comments and transcript; title survives', () => {
    const longDesc = 'd'.repeat(5000);
    const text = [title, longDesc, transcript, comments].join('\n\n');
    const r = fitTextToContext(text, 1000);
    expect(r.text).not.toContain('Video comments');
    expect(r.text).not.toContain('Video transcript');
    expect(r.text.startsWith(`${title}\n\nddd`)).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(2975);
  });

  it('tail-truncates when no known headers are present', () => {
    const text = `${title}\n\n${'x'.repeat(6000)}`;
    const r = fitTextToContext(text, 1000);
    expect(r.text.length).toBe(2975);
    expect(r.text.startsWith(title)).toBe(true);
  });

  it('accounts for fixed prompt overhead', () => {
    const text = `${title}\n\n${'x'.repeat(2900)}`;
    expect(fitTextToContext(text, 1000, 0).trimmed).toBe(false);
    expect(fitTextToContext(text, 1000, 500).trimmed).toBe(true);
  });

  it('logs a trimming warning from the extraction path', async () => {
    process.env.OLLAMA_NUM_CTX = '1000';
    mockFetch.mockResolvedValueOnce(generateOk());
    await extractRecipeFromTextDetailed(`${title}\n\n${'x'.repeat(9000)}`, URL_, 'm');
    expect(warnLines().some((w) => w.includes('input trimmed'))).toBe(true);
    expect(bodyOf(0).prompt).toContain(title);
  });
});
