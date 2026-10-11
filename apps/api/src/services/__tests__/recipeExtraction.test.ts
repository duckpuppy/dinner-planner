import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../settings.js', () => ({
  getSettings: vi.fn(),
}));

vi.mock('../ollama.js', () => ({
  extractRecipeFromTextDetailed: vi.fn(),
}));

import { getSettings } from '../settings.js';
import * as ollamaModule from '../ollama.js';
import { extractRecipeFromMetadata, selectComments } from '../recipeExtraction.js';

const mockGetSettings = vi.mocked(getSettings);
const mockExtractRecipeFromText = vi.mocked(ollamaModule.extractRecipeFromTextDetailed);

const VALID_RECIPE = {
  name: 'Pasta Carbonara',
  description: 'A classic Roman pasta dish.',
  type: 'main' as const,
  ingredients: [
    { quantity: 200, unit: 'g', name: 'spaghetti', notes: null, category: 'Pantry' },
    { quantity: 100, unit: 'g', name: 'pancetta', notes: null, category: 'Meat' },
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

function makeSettings(overrides: Record<string, unknown> = {}) {
  return {
    id: '1',
    weekStartDay: 1,
    recencyWindowDays: 30,
    ollamaUrl: null,
    ollamaModel: 'gemma4-e4b',
    llmMode: 'disabled',
    n8nWebhookUrl: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockGetSettings.mockReset();
  mockExtractRecipeFromText.mockReset();
});

describe('extractRecipeFromMetadata', () => {
  it('returns source none when llmMode is disabled', async () => {
    mockGetSettings.mockResolvedValueOnce(makeSettings({ llmMode: 'disabled' }));
    const result = await extractRecipeFromMetadata({
      title: 'Pasta',
      description: 'Great pasta recipe',
    });
    expect(result.source).toBe('none');
    expect(result.recipe).toBeNull();
    expect(mockExtractRecipeFromText).not.toHaveBeenCalled();
  });

  it('returns source none when description is empty', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'direct', ollamaUrl: 'http://localhost:11434' })
    );
    const result = await extractRecipeFromMetadata({ title: 'Pasta', description: '' });
    expect(result.source).toBe('none');
    expect(result.recipe).toBeNull();
  });

  it('returns source none when description is absent', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'direct', ollamaUrl: 'http://localhost:11434' })
    );
    const result = await extractRecipeFromMetadata({ title: 'Pasta' });
    expect(result.source).toBe('none');
    expect(result.recipe).toBeNull();
  });

  it('returns source none when llmMode is direct but ollamaUrl is missing', async () => {
    mockGetSettings.mockResolvedValueOnce(makeSettings({ llmMode: 'direct', ollamaUrl: null }));
    const result = await extractRecipeFromMetadata({ title: 'Pasta', description: 'A recipe' });
    expect(result.source).toBe('none');
    expect(mockExtractRecipeFromText).not.toHaveBeenCalled();
  });

  it('calls extractRecipeFromText and returns llm source on success', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({
        llmMode: 'direct',
        ollamaUrl: 'http://localhost:11434',
        ollamaModel: 'llama3',
      })
    );
    mockExtractRecipeFromText.mockResolvedValueOnce({ recipe: VALID_RECIPE, error: null });

    const result = await extractRecipeFromMetadata({
      title: 'Pasta',
      description: 'A delicious recipe',
    });

    expect(result.source).toBe('llm');
    expect(result.recipe).toEqual(VALID_RECIPE);
    expect(result.rawTitle).toBe('Pasta');
    expect(result.rawDescription).toBe('A delicious recipe');
    expect(mockExtractRecipeFromText).toHaveBeenCalledWith(
      'Pasta\n\nA delicious recipe',
      'http://localhost:11434',
      'llama3'
    );
  });

  it('returns source none when extractRecipeFromText returns null', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'direct', ollamaUrl: 'http://localhost:11434' })
    );
    mockExtractRecipeFromText.mockResolvedValueOnce({ recipe: null, error: 'boom' });

    const result = await extractRecipeFromMetadata({ title: 'Pasta', description: 'A recipe' });
    expect(result.source).toBe('none');
    expect(result.recipe).toBeNull();
  });

  it('returns source none when llmMode is n8n (placeholder)', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'n8n', n8nWebhookUrl: 'http://n8n/hook' })
    );
    const result = await extractRecipeFromMetadata({ title: 'Pasta', description: 'A recipe' });
    expect(result.source).toBe('none');
    expect(result.recipe).toBeNull();
  });

  it('includes rawTitle and rawDescription in all results', async () => {
    mockGetSettings.mockResolvedValueOnce(makeSettings({ llmMode: 'disabled' }));
    const result = await extractRecipeFromMetadata({
      title: 'My Title',
      description: 'My Description',
    });
    expect(result.rawTitle).toBe('My Title');
    expect(result.rawDescription).toBe('My Description');
  });

  it('uses default model when ollamaModel is null', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({
        llmMode: 'direct',
        ollamaUrl: 'http://localhost:11434',
        ollamaModel: null,
      })
    );
    mockExtractRecipeFromText.mockResolvedValueOnce({ recipe: VALID_RECIPE, error: null });

    await extractRecipeFromMetadata({ title: 'T', description: 'D' });

    expect(mockExtractRecipeFromText).toHaveBeenCalledWith(
      expect.any(String),
      'http://localhost:11434',
      'gemma4-e4b'
    );
  });

  it('appends transcript to text when provided', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'direct', ollamaUrl: 'http://localhost:11434' })
    );
    mockExtractRecipeFromText.mockResolvedValueOnce({ recipe: VALID_RECIPE, error: null });

    await extractRecipeFromMetadata(
      { title: 'Pasta', description: 'A delicious recipe' },
      'today we are making pasta with garlic'
    );

    expect(mockExtractRecipeFromText).toHaveBeenCalledWith(
      'Pasta\n\nA delicious recipe\n\nVideo transcript:\ntoday we are making pasta with garlic',
      'http://localhost:11434',
      'gemma4-e4b'
    );
  });

  it('does not append transcript section when transcript is null', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'direct', ollamaUrl: 'http://localhost:11434' })
    );
    mockExtractRecipeFromText.mockResolvedValueOnce({ recipe: VALID_RECIPE, error: null });

    await extractRecipeFromMetadata({ title: 'Pasta', description: 'A recipe' }, null);

    expect(mockExtractRecipeFromText).toHaveBeenCalledWith(
      'Pasta\n\nA recipe',
      'http://localhost:11434',
      'gemma4-e4b'
    );
  });

  it('does not append transcript section when transcript is empty string', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'direct', ollamaUrl: 'http://localhost:11434' })
    );
    mockExtractRecipeFromText.mockResolvedValueOnce({ recipe: VALID_RECIPE, error: null });

    await extractRecipeFromMetadata({ title: 'Pasta', description: 'A recipe' }, '');

    expect(mockExtractRecipeFromText).toHaveBeenCalledWith(
      'Pasta\n\nA recipe',
      'http://localhost:11434',
      'gemma4-e4b'
    );
  });

  it('truncates very long transcripts to 8000 characters', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'direct', ollamaUrl: 'http://localhost:11434' })
    );
    mockExtractRecipeFromText.mockResolvedValueOnce({ recipe: VALID_RECIPE, error: null });

    const longTranscript = 'x'.repeat(9000);
    await extractRecipeFromMetadata({ title: 'Pasta', description: 'A recipe' }, longTranscript);

    const callArg = mockExtractRecipeFromText.mock.calls[0][0];
    expect(callArg).toContain('Video transcript:\n');
    // Truncated portion: 8000 chars + '...' suffix
    const transcriptSection = callArg.split('Video transcript:\n')[1];
    expect(transcriptSection).toBe('x'.repeat(8000) + '...');
  });
});

// ---------------------------------------------------------------------------
// extraction status / error (dinner-5vx.3)
// ---------------------------------------------------------------------------
describe('extractRecipeFromMetadata — status', () => {
  it('reports disabled when llmMode is disabled', async () => {
    mockGetSettings.mockResolvedValueOnce(makeSettings({ llmMode: 'disabled' }));
    const r = await extractRecipeFromMetadata({ title: 'T', description: 'D' });
    expect(r.status).toBe('disabled');
    expect(r.error).toBeNull();
  });

  it('reports no_description when the post has no description', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'direct', ollamaUrl: 'http://localhost:11434' })
    );
    const r = await extractRecipeFromMetadata({ title: 'T' });
    expect(r.status).toBe('no_description');
  });

  it('reports failed with the friendly error and keeps the raw title/description', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'direct', ollamaUrl: 'http://localhost:11434' })
    );
    mockExtractRecipeFromText.mockResolvedValueOnce({
      recipe: null,
      error: 'The AI model returned an error (HTTP 500)',
    });
    const r = await extractRecipeFromMetadata({ title: 'Pizza Tacos', description: 'ingredients' });
    expect(r.status).toBe('failed');
    expect(r.error).toBe('The AI model returned an error (HTTP 500)');
    expect(r.rawTitle).toBe('Pizza Tacos');
    expect(r.rawDescription).toBe('ingredients');
    expect(r.recipe).toBeNull();
  });

  it('reports llm on success', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'direct', ollamaUrl: 'http://localhost:11434' })
    );
    mockExtractRecipeFromText.mockResolvedValueOnce({ recipe: VALID_RECIPE, error: null });
    const r = await extractRecipeFromMetadata({ title: 'T', description: 'D' });
    expect(r.status).toBe('llm');
    expect(r.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// comments (VIDEO_IMPORT_COMMENTS)
// ---------------------------------------------------------------------------
describe('selectComments', () => {
  it('prefers the uploader comments, then the most-liked others', () => {
    const text = selectComments({
      uploader: 'chef',
      comments: [
        { author: 'a', text: 'low', like_count: 1 },
        { author: 'b', text: 'high', like_count: 50 },
        { author: 'chef', text: 'RECIPE: 2 cups flour', like_count: 0, author_is_uploader: true },
      ],
    });
    expect(text).toBe('RECIPE: 2 cups flour\n---\nhigh\n---\nlow');
  });

  it('matches the uploader by name when author_is_uploader is absent', () => {
    const text = selectComments({
      uploader: 'chef',
      comments: [
        { author: 'a', text: 'popular', like_count: 99 },
        { author: 'chef', text: 'mine' },
      ],
    });
    expect(text?.startsWith('mine')).toBe(true);
  });

  it('keeps at most 10 non-uploader comments and caps length', () => {
    const comments = Array.from({ length: 20 }, (_, i) => ({
      author: `u${i}`,
      text: `c${i}`,
      like_count: i,
    }));
    const text = selectComments({ comments }) as string;
    expect(text.split('\n---\n')).toHaveLength(10);
    const capped = selectComments({ comments: [{ author: 'x', text: 'y'.repeat(9000) }] });
    expect(capped).toBe('y'.repeat(8000) + '...');
  });

  it('returns null when there are no usable comments', () => {
    expect(selectComments({})).toBeNull();
    expect(selectComments({ comments: [{ text: '  ' }, {}] })).toBeNull();
  });
});

describe('extractRecipeFromMetadata — comments flag', () => {
  const metadata = {
    title: 'T',
    description: 'D',
    comments: [{ author: 'chef', text: 'full recipe here', author_is_uploader: true }],
  };

  async function run() {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'direct', ollamaUrl: 'http://localhost:11434' })
    );
    mockExtractRecipeFromText.mockResolvedValueOnce({ recipe: VALID_RECIPE, error: null });
    await extractRecipeFromMetadata(metadata);
    return mockExtractRecipeFromText.mock.calls[0][0];
  }

  it('does not append comments when VIDEO_IMPORT_COMMENTS is off', async () => {
    delete process.env.VIDEO_IMPORT_COMMENTS;
    expect(await run()).not.toContain('full recipe here');
  });

  it('appends comments when VIDEO_IMPORT_COMMENTS=true', async () => {
    process.env.VIDEO_IMPORT_COMMENTS = 'true';
    try {
      const text = await run();
      expect(text).toContain('Video comments');
      expect(text).toContain('full recipe here');
    } finally {
      delete process.env.VIDEO_IMPORT_COMMENTS;
    }
  });
});
