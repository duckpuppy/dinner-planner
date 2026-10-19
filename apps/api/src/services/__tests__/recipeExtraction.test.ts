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

  it('reports no_description when there is no description, transcript or comments', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'direct', ollamaUrl: 'http://localhost:11434' })
    );
    const r = await extractRecipeFromMetadata({ title: 'T', description: '   ' }, '  ');
    expect(r.status).toBe('no_description');
    expect(mockExtractRecipeFromText).not.toHaveBeenCalled();
  });

  it('runs the model when the description is empty but a transcript exists', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'direct', ollamaUrl: 'http://localhost:11434' })
    );
    mockExtractRecipeFromText.mockResolvedValueOnce({ recipe: VALID_RECIPE, error: null });
    const r = await extractRecipeFromMetadata({ title: 'Pasta' }, 'add garlic then pasta');
    expect(r.status).toBe('llm');
    expect(mockExtractRecipeFromText).toHaveBeenCalledWith(
      'Pasta\n\nVideo transcript:\nadd garlic then pasta',
      'http://localhost:11434',
      'gemma4-e4b'
    );
  });

  it('builds the text from the transcript alone when there is no title or description', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'direct', ollamaUrl: 'http://localhost:11434' })
    );
    mockExtractRecipeFromText.mockResolvedValueOnce({ recipe: VALID_RECIPE, error: null });
    await extractRecipeFromMetadata({}, 'just words');
    expect(mockExtractRecipeFromText.mock.calls[0][0]).toBe('Video transcript:\njust words');
  });

  it('reports no_recipe (not failed) when the model finds no usable recipe', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'direct', ollamaUrl: 'http://localhost:11434' })
    );
    mockExtractRecipeFromText.mockResolvedValueOnce({
      recipe: null,
      error: 'No recipe found in this post.',
      notUsable: true,
    });
    const r = await extractRecipeFromMetadata({ title: 'Reel', description: 'so fun' });
    expect(r.status).toBe('no_recipe');
    expect(r.error).toBe('No recipe found in this post.');
    expect(r.recipe).toBeNull();
    expect(r.source).toBe('none');
    expect(r.rawTitle).toBe('Reel');
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

describe('extractRecipeFromMetadata — user-provided extra text', () => {
  const direct = () => makeSettings({ llmMode: 'direct', ollamaUrl: 'http://localhost:11434' });

  it('appends the extra text as its own section', async () => {
    mockGetSettings.mockResolvedValueOnce(direct());
    mockExtractRecipeFromText.mockResolvedValueOnce({ recipe: VALID_RECIPE, error: null });
    await extractRecipeFromMetadata({ title: 'T', description: 'D' }, null, {
      extraText: '  2 cups flour ',
    });
    expect(mockExtractRecipeFromText.mock.calls[0][0]).toContain(
      'Additional text provided by the user:\n2 cups flour'
    );
  });

  it('places the extra text before the transcript and comments sections', async () => {
    mockGetSettings.mockResolvedValueOnce(direct());
    mockExtractRecipeFromText.mockResolvedValueOnce({ recipe: VALID_RECIPE, error: null });
    process.env.VIDEO_IMPORT_COMMENTS = 'true';
    try {
      await extractRecipeFromMetadata(
        { title: 'T', description: 'D', comments: [{ text: 'a comment' }] },
        'a transcript',
        { extraText: 'user text', linkedPage: { host: 'h.com', text: 'PAGE' } }
      );
    } finally {
      delete process.env.VIDEO_IMPORT_COMMENTS;
    }
    const text = mockExtractRecipeFromText.mock.calls[0][0];
    const user = text.indexOf('Additional text provided by the user:');
    expect(user).toBeGreaterThan(text.indexOf('D'));
    expect(user).toBeLessThan(text.indexOf('Video transcript:'));
    expect(user).toBeLessThan(text.indexOf('Video comments'));
    expect(text.indexOf('Linked page')).toBeGreaterThan(text.indexOf('Video comments'));
  });

  it('does not short-circuit to no_description when only extra text exists', async () => {
    mockGetSettings.mockResolvedValueOnce(direct());
    mockExtractRecipeFromText.mockResolvedValueOnce({ recipe: VALID_RECIPE, error: null });
    const r = await extractRecipeFromMetadata({ title: 'T' }, null, {
      extraText: 'pasted recipe',
    });
    expect(r.status).toBe('llm');
    expect(mockExtractRecipeFromText).toHaveBeenCalledTimes(1);
  });

  it('blank extra text still yields no_description', async () => {
    mockGetSettings.mockResolvedValueOnce(direct());
    const r = await extractRecipeFromMetadata({ title: 'T' }, null, { extraText: '   ' });
    expect(r.status).toBe('no_description');
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

describe('extractRecipeFromMetadata — linked page', () => {
  it('appends a "Linked page (<host>)" section to the model input', async () => {
    mockGetSettings.mockResolvedValue({
      llmMode: 'direct',
      ollamaUrl: 'http://ollama:11434',
      ollamaModel: 'm',
    } as never);
    mockExtractRecipeFromText.mockResolvedValue({ recipe: null, error: null, notUsable: true });
    await extractRecipeFromMetadata({ title: 'T', description: 'see link' }, null, {
      linkedPage: { host: 'blog.example.com', text: 'PAGE BODY' },
    });
    const text = mockExtractRecipeFromText.mock.calls[0][0] as string;
    expect(text).toContain('Linked page (blog.example.com):\nPAGE BODY');
    expect(text.indexOf('see link')).toBeLessThan(text.indexOf('Linked page'));
  });

  it('runs the model on linked text even when the caption is empty', async () => {
    mockGetSettings.mockResolvedValue({
      llmMode: 'direct',
      ollamaUrl: 'http://ollama:11434',
    } as never);
    mockExtractRecipeFromText.mockResolvedValue({ recipe: null, error: null, notUsable: true });
    const r = await extractRecipeFromMetadata({}, null, {
      linkedPage: { host: 'h.com', text: 'x' },
    });
    expect(r.status).toBe('no_recipe');
  });
});
