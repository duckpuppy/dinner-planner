import { describe, it, expect } from 'vitest';
import {
  cleanVideoTitle,
  buildFallbackDraft,
  mergeExtractedRecipe,
  extractionNotice,
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
});
