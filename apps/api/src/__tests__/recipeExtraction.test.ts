import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any imports of the modules under test
// ---------------------------------------------------------------------------

const mockGetSettings = vi.hoisted(() => vi.fn());
const mockExtractRecipeFromText = vi.hoisted(() => vi.fn());

vi.mock('../services/settings.js', () => ({
  getSettings: mockGetSettings,
}));

vi.mock('../services/ollama.js', () => ({
  extractRecipeFromText: mockExtractRecipeFromText,
  checkOllamaHealth: vi.fn(),
}));

import { extractRecipeFromMetadata } from '../services/recipeExtraction.js';
import type { ImportedRecipe } from '@dinner-planner/shared';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_RECIPE: ImportedRecipe = {
  name: 'Grilled Chicken',
  description: 'Simple grilled chicken.',
  type: 'main',
  ingredients: [
    {
      quantity: 2,
      unit: 'pieces',
      name: 'chicken breast',
      notes: null,
      category: 'Meat',
      storeIds: [],
    },
  ],
  instructions: 'Grill chicken for 15 minutes.',
  prepTime: 5,
  cookTime: 15,
  servings: 2,
  calories: 300,
  proteinG: 40,
  carbsG: 0,
  fatG: 8,
  sourceUrl: null,
  videoUrl: null,
  tags: ['grilled', 'chicken'],
};

const BASE_METADATA = {
  title: 'Grilled Chicken Recipe',
  description: 'A delicious grilled chicken dish with herbs and lemon.',
};

function makeSettings(overrides: Record<string, unknown> = {}) {
  return {
    id: 'default',
    weekStartDay: 0,
    recencyWindowDays: 30,
    llmMode: 'disabled',
    ollamaUrl: null,
    ollamaModel: 'gemma4-e4b',
    n8nWebhookUrl: null,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// extractRecipeFromMetadata
// ---------------------------------------------------------------------------

describe('extractRecipeFromMetadata — llmMode: disabled', () => {
  it('returns source: none and no recipe', async () => {
    mockGetSettings.mockResolvedValueOnce(makeSettings({ llmMode: 'disabled' }));

    const result = await extractRecipeFromMetadata(BASE_METADATA);

    expect(result.source).toBe('none');
    expect(result.recipe).toBeNull();
    expect(result.rawTitle).toBe('Grilled Chicken Recipe');
    expect(result.rawDescription).toBe(BASE_METADATA.description);
    expect(mockExtractRecipeFromText).not.toHaveBeenCalled();
  });

  it('passes through rawTitle and rawDescription', async () => {
    mockGetSettings.mockResolvedValueOnce(makeSettings({ llmMode: 'disabled' }));

    const result = await extractRecipeFromMetadata({ title: 'My Dish', description: 'Some info' });
    expect(result.rawTitle).toBe('My Dish');
    expect(result.rawDescription).toBe('Some info');
  });
});

describe('extractRecipeFromMetadata — empty description', () => {
  it('returns source: none without calling LLM even in direct mode', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'direct', ollamaUrl: 'http://localhost:11434' })
    );

    const result = await extractRecipeFromMetadata({ title: 'Dish', description: '' });

    expect(result.source).toBe('none');
    expect(result.recipe).toBeNull();
    expect(mockExtractRecipeFromText).not.toHaveBeenCalled();
  });

  it('treats missing description key as empty', async () => {
    mockGetSettings.mockResolvedValueOnce(makeSettings({ llmMode: 'disabled' }));

    const result = await extractRecipeFromMetadata({ title: 'Dish' });
    expect(result.rawDescription).toBe('');
    expect(result.source).toBe('none');
  });
});

describe('extractRecipeFromMetadata — llmMode: direct', () => {
  it('calls extractRecipeFromText with correct text, url and model', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'direct', ollamaUrl: 'http://localhost:11434' })
    );
    mockExtractRecipeFromText.mockResolvedValueOnce(MOCK_RECIPE);

    const result = await extractRecipeFromMetadata(BASE_METADATA);

    expect(mockExtractRecipeFromText).toHaveBeenCalledOnce();
    const [text, url, model] = mockExtractRecipeFromText.mock.calls[0];
    expect(text).toContain('Grilled Chicken Recipe');
    expect(text).toContain(BASE_METADATA.description);
    expect(url).toBe('http://localhost:11434');
    expect(model).toBe('gemma4-e4b');
    expect(result.source).toBe('llm');
    expect(result.recipe).toEqual(MOCK_RECIPE);
  });

  it('uses custom ollamaModel from settings', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({
        llmMode: 'direct',
        ollamaUrl: 'http://localhost:11434',
        ollamaModel: 'llama3',
      })
    );
    mockExtractRecipeFromText.mockResolvedValueOnce(MOCK_RECIPE);

    await extractRecipeFromMetadata(BASE_METADATA);

    const [, , model] = mockExtractRecipeFromText.mock.calls[0];
    expect(model).toBe('llama3');
  });

  it('falls back to gemma4-e4b when ollamaModel is null', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'direct', ollamaUrl: 'http://localhost:11434', ollamaModel: null })
    );
    mockExtractRecipeFromText.mockResolvedValueOnce(MOCK_RECIPE);

    await extractRecipeFromMetadata(BASE_METADATA);

    const [, , model] = mockExtractRecipeFromText.mock.calls[0];
    expect(model).toBe('gemma4-e4b');
  });

  it('returns source: none when extractRecipeFromText returns null', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'direct', ollamaUrl: 'http://localhost:11434' })
    );
    mockExtractRecipeFromText.mockResolvedValueOnce(null);

    const result = await extractRecipeFromMetadata(BASE_METADATA);

    expect(result.source).toBe('none');
    expect(result.recipe).toBeNull();
  });

  it('returns source: none when ollamaUrl is null', async () => {
    mockGetSettings.mockResolvedValueOnce(makeSettings({ llmMode: 'direct', ollamaUrl: null }));

    const result = await extractRecipeFromMetadata(BASE_METADATA);

    expect(result.source).toBe('none');
    expect(result.recipe).toBeNull();
    expect(mockExtractRecipeFromText).not.toHaveBeenCalled();
  });
});

describe('extractRecipeFromMetadata — llmMode: n8n', () => {
  it('returns source: none (n8n not yet implemented)', async () => {
    mockGetSettings.mockResolvedValueOnce(
      makeSettings({ llmMode: 'n8n', n8nWebhookUrl: 'https://n8n.example.com/webhook/abc' })
    );

    const result = await extractRecipeFromMetadata(BASE_METADATA);

    expect(result.source).toBe('none');
    expect(result.recipe).toBeNull();
    expect(mockExtractRecipeFromText).not.toHaveBeenCalled();
  });
});
