import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  query: {
    dishes: { findFirst: vi.fn() },
    tags: { findFirst: vi.fn() },
  },
}));

// Mock all drizzle-orm exports used by dishes.ts
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
  and: vi.fn().mockReturnValue(null),
  like: vi.fn().mockReturnValue(null),
  desc: vi.fn().mockReturnValue(null),
  asc: vi.fn().mockReturnValue(null),
  sql: vi.fn().mockReturnValue(null),
  or: vi.fn().mockReturnValue(null),
  inArray: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
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
  },
}));

import { deleteDish, archiveDish, unarchiveDish } from '../services/dishes.js';

// --- Chain helpers ---

/** select().from().where() — awaits .where() */
function selWhere(result: unknown[]) {
  return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(result) }) };
}

/** select().from().where().orderBy() — awaits .orderBy() */
function selWhereOrderBy(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue(result) }),
    }),
  };
}

/** select({}).from().innerJoin().where() — used by dish tag query */
function selInnerJoinWhere(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(result) }),
    }),
  };
}

function makeUpdate() {
  return { set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) };
}
function makeDelete() {
  return { where: vi.fn().mockResolvedValue(undefined) };
}
function makeInsert() {
  return { values: vi.fn().mockResolvedValue(undefined) };
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

/**
 * Set up the 4 DB calls inside getDishWithRelations():
 * 1. db.query.dishes.findFirst() → dish
 * 2. db.select().from(ingredients).where().orderBy() → []
 * 3. db.select({}).from(dishTags).innerJoin(tags).where() → []
 * 4. db.select({}).from(dishDietaryTags).where() → []
 */
function setupGetDishWithRelations(dish: unknown, tags: string[] = []) {
  mockDb.query.dishes.findFirst.mockResolvedValueOnce(dish);
  mockDb.select.mockReturnValueOnce(selWhereOrderBy([]));           // ingredients
  mockDb.select.mockReturnValueOnce(selInnerJoinWhere(tags.map((t) => ({ name: t })))); // dishTags
  mockDb.select.mockReturnValueOnce(selWhere([]));                   // dishDietaryTags
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.update.mockReturnValue(makeUpdate());
  mockDb.delete.mockReturnValue(makeDelete());
  mockDb.insert.mockReturnValue(makeInsert());
});

// ===========================================================================
// deleteDish
// ===========================================================================

describe('deleteDish', () => {
  it('returns {success: false, error} when dish not found', async () => {
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(undefined);
    const result = await deleteDish('nonexistent');
    expect(result).toEqual({ success: false, error: 'Dish not found' });
  });

  it('returns {success: true} after successful delete', async () => {
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(makeDish());
    mockDb.select.mockReturnValueOnce(selWhere([])); // no preparations
    const result = await deleteDish('dish-1');
    expect(result).toEqual({ success: true });
  });

  it('nullifies mainDishId on dinner entries before deleting', async () => {
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(makeDish());
    mockDb.select.mockReturnValueOnce(selWhere([]));
    await deleteDish('dish-1');
    expect(mockDb.update).toHaveBeenCalledOnce();
  });

  it('does not delete ratings when no preparations exist', async () => {
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(makeDish());
    mockDb.select.mockReturnValueOnce(selWhere([])); // no preps
    await deleteDish('dish-1');
    // Deletes: entrySideDishes, preparations, dishes = 3
    expect(mockDb.delete).toHaveBeenCalledTimes(3);
  });

  it('deletes ratings once per preparation', async () => {
    const preps = [{ id: 'prep-1' }, { id: 'prep-2' }, { id: 'prep-3' }];
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(makeDish());
    mockDb.select.mockReturnValueOnce(selWhere(preps));
    await deleteDish('dish-1');
    // Deletes: entrySideDishes + ratings(3x) + preparations + dishes = 6
    expect(mockDb.delete).toHaveBeenCalledTimes(6);
  });
});

// ===========================================================================
// archiveDish
// ===========================================================================

describe('archiveDish', () => {
  it('returns null when dish not found', async () => {
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(undefined);
    expect(await archiveDish('nonexistent')).toBeNull();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('calls db.update and returns the updated dish', async () => {
    const dish = makeDish();
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(dish);
    setupGetDishWithRelations(makeDish({ archived: true }));

    const result = await archiveDish('dish-1');
    expect(mockDb.update).toHaveBeenCalledOnce();
    expect(result?.archived).toBe(true);
  });
});

// ===========================================================================
// unarchiveDish
// ===========================================================================

describe('unarchiveDish', () => {
  it('returns null when dish not found', async () => {
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(undefined);
    expect(await unarchiveDish('nonexistent')).toBeNull();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('calls db.update and returns the unarchived dish', async () => {
    const dish = makeDish({ archived: true });
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(dish);
    setupGetDishWithRelations(makeDish({ archived: false }));

    const result = await unarchiveDish('dish-1');
    expect(mockDb.update).toHaveBeenCalledOnce();
    expect(result?.archived).toBe(false);
  });
});
