import { describe, it, expect } from 'vitest';
import { importedRecipeSchema } from './index.js';
import { isUsableRecipe, modelRecipeSchema, normalizeModelRecipe } from './modelRecipe.js';

const GOOD = {
  name: 'Pasta',
  description: 'Tasty',
  type: 'main',
  ingredients: [{ quantity: 200, unit: 'g', name: 'spaghetti', notes: null, category: 'Pantry' }],
  instructions: 'Boil.',
  prepTime: 10,
  cookTime: 20,
  servings: 2,
  calories: 500,
  proteinG: 25,
  carbsG: 60,
  fatG: 18,
  sourceUrl: null,
  videoUrl: null,
  tags: ['italian'],
};

describe('normalizeModelRecipe', () => {
  it('passes a well-formed recipe through and satisfies the strict schema', () => {
    const r = normalizeModelRecipe(GOOD);
    expect(r).not.toBeNull();
    expect(importedRecipeSchema.safeParse(r).success).toBe(true);
    expect(r?.name).toBe('Pasta');
    expect(r?.ingredients[0].name).toBe('spaghetti');
  });

  it('turns null/undefined text fields into empty strings (instructions: null)', () => {
    const r = normalizeModelRecipe({ ...GOOD, instructions: null, description: undefined });
    expect(r?.instructions).toBe('');
    expect(r?.description).toBe('');
    expect(importedRecipeSchema.safeParse(r).success).toBe(true);
  });

  it('joins array instructions into lines', () => {
    expect(
      normalizeModelRecipe({ ...GOOD, instructions: ['Boil', ' Drain ', ''] })?.instructions
    ).toBe('Boil\nDrain');
  });

  it('turns missing arrays into []', () => {
    const r = normalizeModelRecipe({ name: 'X' });
    expect(r?.ingredients).toEqual([]);
    expect(r?.tags).toEqual([]);
  });

  it('coerces times and servings to positive integers or null', () => {
    const r = normalizeModelRecipe({
      ...GOOD,
      prepTime: 12.6,
      cookTime: '30',
      servings: 0,
    });
    expect(r?.prepTime).toBe(13);
    expect(r?.cookTime).toBe(30);
    expect(r?.servings).toBeNull();
    const r2 = normalizeModelRecipe({ ...GOOD, prepTime: -5, cookTime: '', servings: NaN });
    expect(r2?.prepTime).toBeNull();
    expect(r2?.cookTime).toBeNull();
    expect(r2?.servings).toBeNull();
    expect(normalizeModelRecipe({ ...GOOD, prepTime: 'abc' })?.prepTime).toBeNull();
  });

  it('coerces nutrition to non-negative numbers or null', () => {
    const r = normalizeModelRecipe({
      ...GOOD,
      calories: -1,
      proteinG: '12.5',
      carbsG: 'x',
      fatG: 0,
    });
    expect(r?.calories).toBeNull();
    expect(r?.proteinG).toBe(12.5);
    expect(r?.carbsG).toBeNull();
    expect(r?.fatG).toBe(0);
  });

  it('defaults unknown type to main and keeps side/both', () => {
    expect(normalizeModelRecipe({ ...GOOD, type: 'dessert' })?.type).toBe('main');
    expect(normalizeModelRecipe({ ...GOOD, type: null })?.type).toBe('main');
    expect(normalizeModelRecipe({ ...GOOD, type: 'Side' })?.type).toBe('side');
    expect(normalizeModelRecipe({ ...GOOD, type: 'both' })?.type).toBe('both');
  });

  it('drops non-string tags', () => {
    expect(normalizeModelRecipe({ ...GOOD, tags: ['a', 1, null, ' b '] })?.tags).toEqual([
      'a',
      'b',
    ]);
    expect(normalizeModelRecipe({ ...GOOD, tags: 'italian' })?.tags).toEqual([]);
  });

  it('nulls invalid sourceUrl/videoUrl and keeps valid ones', () => {
    const r = normalizeModelRecipe({
      ...GOOD,
      sourceUrl: 'not a url',
      videoUrl: 'https://x.com/v',
    });
    expect(r?.sourceUrl).toBeNull();
    expect(r?.videoUrl).toBe('https://x.com/v');
  });

  it('tolerates ingredients with missing fields and drops nameless ones', () => {
    const r = normalizeModelRecipe({
      ...GOOD,
      ingredients: [
        { name: 'salt' },
        { name: '  ' },
        { quantity: 2 },
        'junk',
        null,
        { name: 'egg', quantity: '2', category: null },
      ],
    });
    expect(r?.ingredients.map((i) => i.name)).toEqual(['salt', 'egg']);
    expect(r?.ingredients[0]).toMatchObject({
      quantity: null,
      unit: null,
      notes: null,
      category: 'Other',
    });
    expect(r?.ingredients[1].quantity).toBe(2);
    expect(r?.ingredients[1].category).toBe('Other');
  });

  it('truncates over-long ingredient fields so the strict schema still passes', () => {
    const r = normalizeModelRecipe({
      ...GOOD,
      ingredients: [{ name: 'n'.repeat(300), unit: 'u'.repeat(80) }],
    });
    expect(r?.ingredients[0].name).toHaveLength(200);
    expect(r?.ingredients[0].unit).toHaveLength(50);
  });

  it('returns null for non-object output', () => {
    expect(normalizeModelRecipe(null)).toBeNull();
    expect(normalizeModelRecipe('recipe')).toBeNull();
    expect(normalizeModelRecipe([GOOD])).toBeNull();
    expect(normalizeModelRecipe(42)).toBeNull();
  });

  it('normalises an all-empty object to a valid but unusable recipe', () => {
    const r = normalizeModelRecipe({});
    expect(r).not.toBeNull();
    expect(isUsableRecipe(r!)).toBe(false);
  });
});

describe('modelRecipeSchema', () => {
  it('parses objects and rejects non-objects', () => {
    expect(modelRecipeSchema.safeParse({ ...GOOD, instructions: null }).success).toBe(true);
    expect(modelRecipeSchema.safeParse('x').success).toBe(false);
  });
});

describe('isUsableRecipe', () => {
  const base = { name: 'X', ingredients: [], instructions: '' };
  it('ignores the name', () => {
    expect(isUsableRecipe({ ...base, name: '  ', instructions: 'Cook' })).toBe(true);
    expect(isUsableRecipe({ ...base, name: '' })).toBe(false);
  });
  it('requires ingredients or instructions', () => {
    expect(isUsableRecipe(base)).toBe(false);
    expect(isUsableRecipe({ ...base, instructions: '   ' })).toBe(false);
    expect(isUsableRecipe({ ...base, instructions: 'Cook' })).toBe(true);
    expect(
      isUsableRecipe({
        ...base,
        ingredients: [
          { quantity: null, unit: null, name: 'a', notes: null, category: 'Other', storeIds: [] },
        ],
      })
    ).toBe(true);
  });
});
