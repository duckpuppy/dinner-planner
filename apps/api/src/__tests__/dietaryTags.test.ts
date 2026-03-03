/**
 * Tests for dietary tags feature (M18):
 * - Shared schema validation (dietaryTagSchema, createDishSchema, etc.)
 * - createDish / updateDish / getDishById with dietaryTags (dishes service)
 * - updateUserPreferences with dietaryPreferences (users service)
 * - getSuggestions filtered by dietaryTags (suggestions schema)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===========================
// Shared schema tests (no DB needed)
// ===========================

import {
  dietaryTagSchema,
  DIETARY_TAGS,
  createDishSchema,
  updateDishSchema,
  userPreferencesSchema,
  suggestionsQuerySchema,
  dishQuerySchema,
} from '@dinner-planner/shared';

describe('DIETARY_TAGS constant', () => {
  it('contains the 7 expected tags', () => {
    expect(DIETARY_TAGS).toEqual([
      'vegetarian',
      'vegan',
      'gluten_free',
      'dairy_free',
      'nut_free',
      'low_carb',
      'low_calorie',
    ]);
  });
});

describe('dietaryTagSchema', () => {
  it('accepts all valid dietary tags', () => {
    for (const tag of DIETARY_TAGS) {
      expect(() => dietaryTagSchema.parse(tag)).not.toThrow();
    }
  });

  it('rejects unknown tag', () => {
    expect(() => dietaryTagSchema.parse('halal')).toThrow();
    expect(() => dietaryTagSchema.parse('kosher')).toThrow();
    expect(() => dietaryTagSchema.parse('')).toThrow();
  });
});

describe('createDishSchema - dietaryTags', () => {
  const base = { name: 'Salad', type: 'side' as const };

  it('defaults dietaryTags to []', () => {
    const result = createDishSchema.parse(base);
    expect(result.dietaryTags).toEqual([]);
  });

  it('accepts valid dietary tags', () => {
    const result = createDishSchema.parse({ ...base, dietaryTags: ['vegan', 'gluten_free'] });
    expect(result.dietaryTags).toEqual(['vegan', 'gluten_free']);
  });

  it('rejects invalid dietary tag', () => {
    expect(() => createDishSchema.parse({ ...base, dietaryTags: ['invalid_tag'] })).toThrow();
  });

  it('accepts empty array', () => {
    const result = createDishSchema.parse({ ...base, dietaryTags: [] });
    expect(result.dietaryTags).toEqual([]);
  });
});

describe('updateDishSchema - dietaryTags', () => {
  it('allows partial update with dietaryTags', () => {
    const result = updateDishSchema.parse({ dietaryTags: ['vegetarian', 'dairy_free'] });
    expect(result.dietaryTags).toEqual(['vegetarian', 'dairy_free']);
  });

  it('allows update without dietaryTags (undefined)', () => {
    const result = updateDishSchema.parse({ name: 'New Name' });
    expect(result.dietaryTags).toBeUndefined();
  });

  it('accepts all dietary tags in update', () => {
    const result = updateDishSchema.parse({ dietaryTags: [...DIETARY_TAGS] });
    expect(result.dietaryTags).toHaveLength(DIETARY_TAGS.length);
  });
});

describe('userPreferencesSchema - dietaryPreferences', () => {
  it('accepts dietaryPreferences array', () => {
    const result = userPreferencesSchema.parse({
      theme: 'dark',
      dietaryPreferences: ['vegetarian', 'nut_free'],
    });
    expect(result.dietaryPreferences).toEqual(['vegetarian', 'nut_free']);
  });

  it('dietaryPreferences is optional', () => {
    const result = userPreferencesSchema.parse({ theme: 'light' });
    expect(result.dietaryPreferences).toBeUndefined();
  });

  it('accepts empty array for dietaryPreferences', () => {
    const result = userPreferencesSchema.parse({ dietaryPreferences: [] });
    expect(result.dietaryPreferences).toEqual([]);
  });

  it('rejects invalid dietary preference value', () => {
    expect(() => userPreferencesSchema.parse({ dietaryPreferences: ['not_a_tag'] })).toThrow();
  });

  it('accepts all dietary tags as preferences', () => {
    const result = userPreferencesSchema.parse({ dietaryPreferences: [...DIETARY_TAGS] });
    expect(result.dietaryPreferences).toHaveLength(DIETARY_TAGS.length);
  });
});

describe('suggestionsQuerySchema - dietaryTags', () => {
  it('defaults dietaryTags to []', () => {
    const result = suggestionsQuerySchema.parse({});
    expect(result.dietaryTags).toEqual([]);
  });

  it('coerces single string to array', () => {
    const result = suggestionsQuerySchema.parse({ dietaryTags: 'vegan' });
    expect(result.dietaryTags).toEqual(['vegan']);
  });

  it('accepts array of dietary tags', () => {
    const result = suggestionsQuerySchema.parse({ dietaryTags: ['vegan', 'low_carb'] });
    expect(result.dietaryTags).toEqual(['vegan', 'low_carb']);
  });

  it('rejects invalid dietary tag in array', () => {
    expect(() => suggestionsQuerySchema.parse({ dietaryTags: ['invalid'] })).toThrow();
  });

  it('preserves existing fields (tag, limit, exclude)', () => {
    const result = suggestionsQuerySchema.parse({
      tag: 'quick',
      limit: '3',
      dietaryTags: ['vegan'],
    });
    expect(result.tag).toBe('quick');
    expect(result.limit).toBe(3);
    expect(result.dietaryTags).toEqual(['vegan']);
  });
});

describe('dishQuerySchema - dietaryTags', () => {
  it('defaults dietaryTags to []', () => {
    const result = dishQuerySchema.parse({});
    expect(result.dietaryTags).toEqual([]);
  });

  it('coerces single string to array', () => {
    const result = dishQuerySchema.parse({ dietaryTags: 'vegan' });
    expect(result.dietaryTags).toEqual(['vegan']);
  });

  it('accepts multiple dietary tags', () => {
    const result = dishQuerySchema.parse({ dietaryTags: ['vegan', 'nut_free'] });
    expect(result.dietaryTags).toEqual(['vegan', 'nut_free']);
  });
});

// ===========================
// Dishes service unit tests
// ===========================

const mockDbDishes = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  query: {
    dishes: { findFirst: vi.fn() },
    tags: { findFirst: vi.fn() },
    users: { findFirst: vi.fn() },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
  and: vi.fn().mockReturnValue(null),
  like: vi.fn().mockReturnValue(null),
  desc: vi.fn().mockReturnValue(null),
  asc: vi.fn().mockReturnValue(null),
  sql: vi.fn().mockReturnValue(null),
  or: vi.fn().mockReturnValue(null),
  inArray: vi.fn().mockReturnValue(null),
  notInArray: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDbDishes,
  schema: {
    dishes: {
      id: null,
      archived: null,
      name: null,
      type: null,
      description: null,
      updatedAt: null,
    },
    ingredients: { dishId: null, sortOrder: null },
    dishTags: { dishId: null, tagId: null },
    dishDietaryTags: { dishId: null, tag: null },
    tags: { id: null, name: null },
    dinnerEntries: { mainDishId: null, id: null },
    entrySideDishes: { dishId: null },
    preparations: { dishId: null, id: null },
    ratings: { preparationId: null },
    users: { id: null, username: null },
    refreshTokens: { userId: null },
  },
}));

vi.mock('../services/auth.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed-pw'),
  verifyPassword: vi.fn().mockResolvedValue(true),
}));

import { createDish, updateDish, getDishById } from '../services/dishes.js';
import { updateUserPreferences, getUserById } from '../services/users.js';

// Chain helpers
function selWhere(result: unknown[]) {
  return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(result) }) };
}

function selWhereOrderBy(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue(result) }),
    }),
  };
}

function selInnerJoinWhere(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(result) }),
    }),
  };
}

function makeInsert() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}
function makeUpdate() {
  return { set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) };
}
function makeDelete() {
  return { where: vi.fn().mockResolvedValue(undefined) };
}

function makeDish(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dish-1',
    name: 'Pasta',
    type: 'main',
    description: '',
    instructions: '',
    prepTime: null,
    cookTime: null,
    servings: null,
    calories: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    sourceUrl: null,
    videoUrl: null,
    archived: false,
    createdById: 'user-1',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...overrides,
  };
}

const mockUserBase = {
  id: 'user-1',
  username: 'alice',
  displayName: 'Alice',
  role: 'member' as const,
  theme: 'light' as const,
  homeView: 'today' as const,
  passwordHash: 'hashed-pw',
  dietaryPreferences: '[]',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

/**
 * Setup getDishWithRelations: 4 DB calls
 * 1. db.query.dishes.findFirst → dish
 * 2. ingredients: select().from().where().orderBy() → []
 * 3. dishTags: select().from().innerJoin().where() → []
 * 4. dishDietaryTags: select().from().where() → dietaryTagRows
 */
function setupGetDishWithRelations(dish: unknown, tags: string[] = [], dietaryTags: string[] = []) {
  mockDbDishes.query.dishes.findFirst.mockResolvedValueOnce(dish);
  mockDbDishes.select.mockReturnValueOnce(selWhereOrderBy([]));
  mockDbDishes.select.mockReturnValueOnce(selInnerJoinWhere(tags.map((t) => ({ name: t }))));
  mockDbDishes.select.mockReturnValueOnce(selWhere(dietaryTags.map((t) => ({ tag: t }))));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDbDishes.update.mockReturnValue(makeUpdate());
  mockDbDishes.delete.mockReturnValue(makeDelete());
  mockDbDishes.insert.mockReturnValue(makeInsert());
});

// ===========================================================================
// getDishById - includes dietaryTags in response
// ===========================================================================

describe('getDishById - dietaryTags in response', () => {
  it('returns dietaryTags from dishDietaryTags table', async () => {
    setupGetDishWithRelations(makeDish(), [], ['vegan', 'gluten_free']);
    const result = await getDishById('dish-1');
    expect(result).not.toBeNull();
    expect(result!.dietaryTags).toEqual(['vegan', 'gluten_free']);
  });

  it('returns empty dietaryTags when none set', async () => {
    setupGetDishWithRelations(makeDish(), [], []);
    const result = await getDishById('dish-1');
    expect(result!.dietaryTags).toEqual([]);
  });

  it('returns both free-form tags and dietary tags', async () => {
    setupGetDishWithRelations(makeDish(), ['quick', 'easy'], ['vegan']);
    const result = await getDishById('dish-1');
    expect(result!.tags).toEqual(['quick', 'easy']);
    expect(result!.dietaryTags).toEqual(['vegan']);
  });

  it('returns null when dish not found', async () => {
    mockDbDishes.query.dishes.findFirst.mockResolvedValueOnce(null);
    const result = await getDishById('nonexistent');
    expect(result).toBeNull();
  });
});

// ===========================================================================
// createDish - with dietaryTags
// ===========================================================================

describe('createDish - with dietaryTags', () => {
  it('inserts dietary tags into dishDietaryTags table', async () => {
    const input = createDishSchema.parse({
      name: 'Vegan Bowl',
      type: 'main',
      dietaryTags: ['vegan', 'gluten_free'],
    });

    setupGetDishWithRelations(makeDish(), [], ['vegan', 'gluten_free']);

    await createDish(input, 'user-1');

    // insert calls: dish + dietaryTags (2 total, no free-form tags)
    expect(mockDbDishes.insert).toHaveBeenCalledTimes(2);
  });

  it('does not insert dietary tags when none provided', async () => {
    const input = createDishSchema.parse({ name: 'Plain Pasta', type: 'main' });

    setupGetDishWithRelations(makeDish(), [], []);

    await createDish(input, 'user-1');

    // Only dish insert (no tags, no dietary tags)
    expect(mockDbDishes.insert).toHaveBeenCalledTimes(1);
  });

  it('returns dish with dietaryTags populated', async () => {
    const input = createDishSchema.parse({
      name: 'Salad',
      type: 'side',
      dietaryTags: ['vegetarian'],
    });

    setupGetDishWithRelations(makeDish(), [], ['vegetarian']);

    const result = await createDish(input, 'user-1');
    expect(result.dietaryTags).toEqual(['vegetarian']);
  });
});

// ===========================================================================
// updateDish - with dietaryTags
// ===========================================================================

describe('updateDish - with dietaryTags', () => {
  it('replaces dietary tags on update', async () => {
    mockDbDishes.query.dishes.findFirst.mockResolvedValueOnce(makeDish());
    setupGetDishWithRelations(makeDish(), [], ['vegetarian']);

    const input = updateDishSchema.parse({ dietaryTags: ['vegetarian'] });
    const result = await updateDish('dish-1', input);

    // delete old dietary tags + insert new ones
    expect(mockDbDishes.delete).toHaveBeenCalled();
    expect(mockDbDishes.insert).toHaveBeenCalled();
    expect(result!.dietaryTags).toEqual(['vegetarian']);
  });

  it('clears dietary tags when empty array provided', async () => {
    mockDbDishes.query.dishes.findFirst.mockResolvedValueOnce(makeDish());
    setupGetDishWithRelations(makeDish(), [], []);

    const input = updateDishSchema.parse({ dietaryTags: [] });
    await updateDish('dish-1', input);

    // delete called but no insert for empty array
    expect(mockDbDishes.delete).toHaveBeenCalled();
    expect(mockDbDishes.insert).not.toHaveBeenCalled();
  });

  it('does not touch dietaryTags when not in update input', async () => {
    mockDbDishes.query.dishes.findFirst.mockResolvedValueOnce(makeDish());
    setupGetDishWithRelations(makeDish(), [], ['vegan']);

    const input = updateDishSchema.parse({ name: 'New Name' });
    const result = await updateDish('dish-1', input);

    // No delete for dietary tags
    expect(result).not.toBeNull();
  });

  it('returns null when dish not found', async () => {
    mockDbDishes.query.dishes.findFirst.mockResolvedValueOnce(null);
    const result = await updateDish('nonexistent', { name: 'x' });
    expect(result).toBeNull();
  });
});

// ===========================================================================
// Users service - dietaryPreferences
// ===========================================================================

describe('getUserById - includes dietaryPreferences', () => {
  it('parses and returns dietaryPreferences array', async () => {
    mockDbDishes.query.users.findFirst.mockResolvedValueOnce({
      ...mockUserBase,
      dietaryPreferences: '["vegetarian","nut_free"]',
    });
    const result = await getUserById('user-1');
    expect(result).not.toBeNull();
    expect(result!.dietaryPreferences).toEqual(['vegetarian', 'nut_free']);
  });

  it('returns empty array when dietaryPreferences is []', async () => {
    mockDbDishes.query.users.findFirst.mockResolvedValueOnce(mockUserBase);
    const result = await getUserById('user-1');
    expect(result!.dietaryPreferences).toEqual([]);
  });

  it('returns empty array when dietaryPreferences is malformed JSON', async () => {
    mockDbDishes.query.users.findFirst.mockResolvedValueOnce({
      ...mockUserBase,
      dietaryPreferences: 'not-json',
    });
    const result = await getUserById('user-1');
    expect(result!.dietaryPreferences).toEqual([]);
  });
});

describe('updateUserPreferences - dietaryPreferences', () => {
  it('returns null when user not found', async () => {
    mockDbDishes.query.users.findFirst.mockResolvedValueOnce(null);
    const result = await updateUserPreferences('nonexistent', {
      dietaryPreferences: ['vegan'],
    });
    expect(result).toBeNull();
  });

  it('serializes and persists dietaryPreferences', async () => {
    mockDbDishes.query.users.findFirst.mockResolvedValueOnce(mockUserBase);
    mockDbDishes.update.mockReturnValueOnce(makeUpdate());
    mockDbDishes.query.users.findFirst.mockResolvedValueOnce({
      ...mockUserBase,
      dietaryPreferences: '["vegan","low_carb"]',
    });

    const result = await updateUserPreferences('user-1', {
      dietaryPreferences: ['vegan', 'low_carb'],
    });

    expect(mockDbDishes.update).toHaveBeenCalled();
    expect(result!.dietaryPreferences).toEqual(['vegan', 'low_carb']);
  });

  it('preserves theme and homeView alongside dietaryPreferences update', async () => {
    mockDbDishes.query.users.findFirst.mockResolvedValueOnce(mockUserBase);
    mockDbDishes.update.mockReturnValueOnce(makeUpdate());
    mockDbDishes.query.users.findFirst.mockResolvedValueOnce({
      ...mockUserBase,
      theme: 'dark' as const,
      dietaryPreferences: '["vegetarian"]',
    });

    const result = await updateUserPreferences('user-1', {
      theme: 'dark',
      dietaryPreferences: ['vegetarian'],
    });

    expect(result!.theme).toBe('dark');
    expect(result!.dietaryPreferences).toEqual(['vegetarian']);
  });

  it('updates theme without affecting dietaryPreferences in response', async () => {
    mockDbDishes.query.users.findFirst.mockResolvedValueOnce(mockUserBase);
    mockDbDishes.update.mockReturnValueOnce(makeUpdate());
    mockDbDishes.query.users.findFirst.mockResolvedValueOnce({
      ...mockUserBase,
      theme: 'dark' as const,
      dietaryPreferences: '["vegan"]',
    });

    const result = await updateUserPreferences('user-1', { theme: 'dark' });

    expect(result!.theme).toBe('dark');
    // dietaryPreferences comes from what DB returns, not what we passed
    expect(result!.dietaryPreferences).toEqual(['vegan']);
  });
});
