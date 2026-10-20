import { describe, it, expect } from 'vitest';
import {
  cleanVideoTitle,
  buildFallbackDraft,
  mergeExtractedRecipe,
  extractionNotice,
  buildReextractInput,
  rememberedInput,
} from './videoImport';
import type { VideoJob } from './api';

describe('cleanVideoTitle', () => {
  it('cleans the pizza tacos example', () => {
    expect(cleanVideoTitle('🧀🌮🍕 Pepperoni Pizza Tacos 🍕🌮🧀 Ingredients: …')).toBe(
      'Pepperoni Pizza Tacos'
    );
  });
  it('keeps plain titles', () => {
    expect(cleanVideoTitle('Simple Lemon Chicken')).toBe('Simple Lemon Chicken');
  });
  it('drops hashtags', () => {
    expect(cleanVideoTitle('Garlic Noodles #fyp #easyrecipe')).toBe('Garlic Noodles');
  });
  it('returns empty for hashtag-only, emoji-only, null and empty input', () => {
    expect(cleanVideoTitle('#fyp #food')).toBe('');
    expect(cleanVideoTitle('🍕🍕')).toBe('');
    expect(cleanVideoTitle(null)).toBe('');
    expect(cleanVideoTitle(undefined)).toBe('');
    expect(cleanVideoTitle('   ')).toBe('');
  });
  it('cuts at the first sentence boundary and first line', () => {
    expect(cleanVideoTitle('Best chili ever. You will love it')).toBe('Best chili ever');
    expect(cleanVideoTitle('Best chili\nsecond line')).toBe('Best chili');
  });
  it('cuts at a pipe separator and trims decoration', () => {
    expect(cleanVideoTitle('--- Beef Stew | Some Channel ---')).toBe('Beef Stew');
  });
  it('does not treat a leading "Recipe:" label as a cut point', () => {
    expect(cleanVideoTitle('Recipe: Pasta Bake')).toBe('Recipe: Pasta Bake');
  });
  it('caps long titles at about 80 chars on a word boundary', () => {
    const long = 'word '.repeat(40);
    const out = cleanVideoTitle(long);
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out.endsWith('word')).toBe(true);
  });
});

const baseJob: VideoJob = {
  id: 'j',
  dishId: null,
  sourceUrl: 'https://x.com/a',
  status: 'complete',
  progress: 100,
  resultVideoFilename: null,
  resultMetadata: null,
  extractedRecipe: null,
  error: null,
  rawTitle: null,
  rawDescription: null,
  extractionStatus: null,
  extractionError: null,
  warning: null,
  createdAt: '',
  updatedAt: '',
};

describe('buildFallbackDraft', () => {
  it('uses raw fields', () => {
    expect(
      buildFallbackDraft({ ...baseJob, rawTitle: '🍕 Pizza', rawDescription: 'desc' })
    ).toEqual({
      name: 'Pizza',
      description: 'desc',
      type: 'main',
      sourceUrl: 'https://x.com/a',
      ingredients: [],
    });
  });
  it('does not prefill the name with engagement stats', () => {
    const d = buildFallbackDraft({
      ...baseJob,
      rawTitle: '978K views · 16K reactions',
      rawDescription: 'Cowboy Mashed Potato Casserole #recipe\nIngredients',
    });
    expect(d.name).toBe('Cowboy Mashed Potato Casserole');
  });
  it('falls back to resultMetadata', () => {
    const d = buildFallbackDraft({
      ...baseJob,
      resultMetadata: { title: 'Meta Title', description: 'Meta desc' },
    });
    expect(d.name).toBe('Meta Title');
    expect(d.description).toBe('Meta desc');
  });
  it('is empty when nothing is available', () => {
    const d = buildFallbackDraft(baseJob);
    expect(d.name).toBe('');
    expect(d.description).toBe('');
  });
});

describe('mergeExtractedRecipe', () => {
  const draft = { name: 'Mine', description: 'Mine d', type: 'main' as const, sourceUrl: 's' };
  const recipe = { name: 'AI', description: 'AI d', type: 'side' as const, sourceUrl: null };
  it('keeps edited fields and takes the rest', () => {
    const out = mergeExtractedRecipe(draft, recipe, { name: true, description: false });
    expect(out.name).toBe('Mine');
    expect(out.description).toBe('AI d');
    expect(out.type).toBe('side');
    expect(out.sourceUrl).toBe('s');
  });
  it('keeps the draft value when the recipe field is empty', () => {
    const out = mergeExtractedRecipe(
      draft,
      { ...recipe, name: '' },
      { name: false, description: false }
    );
    expect(out.name).toBe('Mine');
  });
});

describe('extractionNotice', () => {
  it('returns null for llm / null status', () => {
    expect(extractionNotice({ ...baseJob, extractionStatus: 'llm' })).toBeNull();
    expect(extractionNotice(baseJob)).toBeNull();
  });
  it('omits the error suffix when no error is present', () => {
    expect(extractionNotice({ ...baseJob, extractionStatus: 'failed' })).toBe(
      'AI recipe extraction failed — prefilled from the post.'
    );
  });
  it('shows a notice for no_recipe', () => {
    expect(extractionNotice({ ...baseJob, extractionStatus: 'no_recipe' })).toBe(
      'No recipe found in this post — prefilled from the post. If the recipe is in a comment, paste it or its link below. Check it before saving.'
    );
  });
});

describe('buildReextractInput', () => {
  it('returns null for empty / whitespace input', () => {
    expect(buildReextractInput('')).toBeNull();
    expect(buildReextractInput('  \n ')).toBeNull();
  });
  it('treats a single http(s) URL as recipeUrl (trimmed)', () => {
    expect(buildReextractInput('  https://example.com/r?id=1 ')).toEqual({
      recipeUrl: 'https://example.com/r?id=1',
    });
    expect(buildReextractInput('http://example.com/r')).toEqual({
      recipeUrl: 'http://example.com/r',
    });
  });
  it('treats text, or text containing a URL, as extraText', () => {
    expect(buildReextractInput('2 cups flour')).toEqual({ extraText: '2 cups flour' });
    expect(buildReextractInput('see https://example.com/r for more')).toEqual({
      extraText: 'see https://example.com/r for more',
    });
    expect(buildReextractInput('https://a.test/x https://b.test/y')).toEqual({
      extraText: 'https://a.test/x https://b.test/y',
    });
  });
  it('does not treat other schemes as a link', () => {
    expect(buildReextractInput('ftp://a.test/x')).toEqual({ extraText: 'ftp://a.test/x' });
  });
});

describe('rememberedInput', () => {
  it('reads the persisted user input', () => {
    expect(
      rememberedInput({ ...baseJob, resultMetadata: { userInput: { extraText: 'abc' } } })
    ).toBe('abc');
    expect(
      rememberedInput({
        ...baseJob,
        resultMetadata: { userInput: { recipeUrl: 'https://a.test' } },
      })
    ).toBe('https://a.test');
    expect(rememberedInput(baseJob)).toBe('');
  });
});

describe('extractionNotice — linked page', () => {
  it('shows the linked-page error when a link was the last input', () => {
    expect(
      extractionNotice({
        ...baseJob,
        extractionStatus: 'no_recipe',
        extractionError: 'That page has no recipe data we can read. Paste the recipe text instead.',
        resultMetadata: { userInput: { recipeUrl: 'https://a.test' } },
      })
    ).toBe(
      'That page has no recipe data we can read. Paste the recipe text instead. Prefilled from the post.'
    );
  });

  it('shows the blocked-site message for a failed pasted link', () => {
    expect(
      extractionNotice({
        ...baseJob,
        extractionStatus: 'failed',
        extractionError:
          'That site blocked our automated request. Open the page and paste the recipe text here instead.',
        resultMetadata: { userInput: { recipeUrl: 'https://a.test' } },
      })
    ).toBe(
      'That site blocked our automated request. Open the page and paste the recipe text here instead. Prefilled from the post.'
    );
  });
});
