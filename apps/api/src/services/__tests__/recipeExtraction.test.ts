import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../settings.js', () => ({
  getSettings: vi.fn(),
}));

vi.mock('../ollama.js', () => ({
  extractRecipeFromText: vi.fn(),
}));

import { getSettings } from '../settings.js';
import * as ollamaModule from '../ollama.js';
import { extractRecipeFromMetadata } from '../recipeExtraction.js';

const mockGetSettings = vi.mocked(getSettings);
const mockExtractRecipeFromText = vi.mocked(ollamaModule.extractRecipeFromText);

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
    mockExtractRecipeFromText.mockResolvedValueOnce(VALID_RECIPE);

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
    mockExtractRecipeFromText.mockResolvedValueOnce(null);

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
    mockExtractRecipeFromText.mockResolvedValueOnce(VALID_RECIPE);

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
    mockExtractRecipeFromText.mockResolvedValueOnce(VALID_RECIPE);

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
    mockExtractRecipeFromText.mockResolvedValueOnce(VALID_RECIPE);

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
    mockExtractRecipeFromText.mockResolvedValueOnce(VALID_RECIPE);

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
    mockExtractRecipeFromText.mockResolvedValueOnce(VALID_RECIPE);

    const longTranscript = 'x'.repeat(9000);
    await extractRecipeFromMetadata({ title: 'Pasta', description: 'A recipe' }, longTranscript);

    const callArg = mockExtractRecipeFromText.mock.calls[0][0];
    expect(callArg).toContain('Video transcript:\n');
    // Truncated portion: 8000 chars + '...' suffix
    const transcriptSection = callArg.split('Video transcript:\n')[1];
    expect(transcriptSection).toBe('x'.repeat(8000) + '...');
  });
});
