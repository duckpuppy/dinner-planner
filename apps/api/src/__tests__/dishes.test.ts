import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDeleteVideo = vi.hoisted(() => vi.fn<() => Promise<void>>().mockResolvedValue(undefined));

vi.mock('../services/videoDownload.js', () => ({
  deleteVideo: mockDeleteVideo,
}));

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

import {
  deleteDish,
  archiveDish,
  unarchiveDish,
  getDishes,
  createDish,
  updateDish,
  getAllTags,
  getDishesByIds,
} from '../services/dishes.js';

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
  mockDb.select.mockReturnValueOnce(selWhereOrderBy([])); // ingredients
  mockDb.select.mockReturnValueOnce(selInnerJoinWhere(tags.map((t) => ({ name: t })))); // dishTags
  mockDb.select.mockReturnValueOnce(selWhere([])); // dishDietaryTags
}

beforeEach(() => {
  vi.resetAllMocks();
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

  it('calls deleteVideo when dish has a localVideoFilename', async () => {
    const dish = makeDish({ localVideoFilename: 'abc123.mp4' });
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(dish);
    mockDb.select.mockReturnValueOnce(selWhere([])); // no preparations
    await deleteDish('dish-1');
    expect(mockDeleteVideo).toHaveBeenCalledWith('abc123.mp4');
  });

  it('does not call deleteVideo when dish has no localVideoFilename', async () => {
    const dish = makeDish({ localVideoFilename: null });
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(dish);
    mockDb.select.mockReturnValueOnce(selWhere([])); // no preparations
    await deleteDish('dish-1');
    expect(mockDeleteVideo).not.toHaveBeenCalled();
  });

  it('still succeeds if deleteVideo throws', async () => {
    const dish = makeDish({ localVideoFilename: 'abc123.mp4' });
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(dish);
    mockDb.select.mockReturnValueOnce(selWhere([]));
    mockDeleteVideo.mockRejectedValueOnce(new Error('disk error'));
    const result = await deleteDish('dish-1');
    expect(result).toEqual({ success: true });
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

// Additional chain helpers
function selWhereCountOrderBy(count: number) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ count }]),
    }),
  };
}

function selWhereOrderByLimitOffset(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            offset: vi.fn().mockResolvedValue(result),
          }),
        }),
      }),
    }),
  };
}

function selLeftJoinGroupByOrderBy(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        groupBy: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(result),
        }),
      }),
    }),
  };
}

// ===========================================================================
// getDishes
// ===========================================================================

describe('getDishes', () => {
  it('returns dishes with total count', async () => {
    const dish = makeDish();
    // 1. count query
    mockDb.select.mockReturnValueOnce(selWhereCountOrderBy(1));
    // 2. dishes query
    mockDb.select.mockReturnValueOnce(selWhereOrderByLimitOffset([dish]));
    // 3-5. getDishWithRelations for dish-1
    setupGetDishWithRelations(dish);

    const result = await getDishes({
      archived: false,
      sort: 'name',
      order: 'asc',
      limit: 10,
      offset: 0,
    });

    expect(result.dishes).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('returns zero total when no dishes', async () => {
    mockDb.select.mockReturnValueOnce(selWhereCountOrderBy(0));
    mockDb.select.mockReturnValueOnce(selWhereOrderByLimitOffset([]));

    const result = await getDishes({
      archived: false,
      sort: 'name',
      order: 'asc',
      limit: 10,
      offset: 0,
    });

    expect(result.dishes).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('filters by type when specified', async () => {
    const dish = makeDish();
    mockDb.select.mockReturnValueOnce(selWhereCountOrderBy(1));
    mockDb.select.mockReturnValueOnce(selWhereOrderByLimitOffset([dish]));
    setupGetDishWithRelations(dish);

    const result = await getDishes({
      archived: false,
      type: 'main',
      sort: 'name',
      order: 'asc',
      limit: 10,
      offset: 0,
    });

    expect(result.dishes).toHaveLength(1);
  });

  it('uses created sort order', async () => {
    mockDb.select.mockReturnValueOnce(selWhereCountOrderBy(0));
    mockDb.select.mockReturnValueOnce(selWhereOrderByLimitOffset([]));

    await getDishes({ archived: false, sort: 'created', order: 'desc', limit: 10, offset: 0 });

    expect(mockDb.select).toHaveBeenCalledTimes(2);
  });

  it('uses recent sort order', async () => {
    mockDb.select.mockReturnValueOnce(selWhereCountOrderBy(0));
    mockDb.select.mockReturnValueOnce(selWhereOrderByLimitOffset([]));

    await getDishes({ archived: false, sort: 'recent', order: 'asc', limit: 10, offset: 0 });

    expect(mockDb.select).toHaveBeenCalledTimes(2);
  });

  it('filters by tag post-query', async () => {
    // Only return one dish from DB, and it has the 'italian' tag
    const dish = makeDish();
    mockDb.select.mockReturnValueOnce(selWhereCountOrderBy(1));
    mockDb.select.mockReturnValueOnce(selWhereOrderByLimitOffset([dish]));
    // getDishWithRelations for dish-1: has italian tag
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(dish);
    mockDb.select.mockReturnValueOnce(selWhereOrderBy([])); // ingredients
    mockDb.select.mockReturnValueOnce(selInnerJoinWhere([{ name: 'italian' }])); // tags
    mockDb.select.mockReturnValueOnce(selWhere([])); // dietary

    const result = await getDishes({
      archived: false,
      tag: 'italian',
      sort: 'name',
      order: 'asc',
      limit: 10,
      offset: 0,
    });

    expect(result.dishes).toHaveLength(1);
    expect(result.dishes[0].tags).toContain('italian');
  });

  it('filters by dietaryTags post-query', async () => {
    const dish = makeDish();
    mockDb.select.mockReturnValueOnce(selWhereCountOrderBy(1));
    mockDb.select.mockReturnValueOnce(selWhereOrderByLimitOffset([dish]));
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(dish);
    mockDb.select.mockReturnValueOnce(selWhereOrderBy([]));
    mockDb.select.mockReturnValueOnce(selInnerJoinWhere([]));
    mockDb.select.mockReturnValueOnce(selWhere([{ tag: 'vegan' }]));

    const result = await getDishes({
      archived: false,
      dietaryTags: ['vegan'],
      sort: 'name',
      order: 'asc',
      limit: 10,
      offset: 0,
    });

    expect(result.dishes).toHaveLength(1);
  });
});

// ===========================================================================
// createDish
// ===========================================================================

describe('createDish', () => {
  it('creates dish without ingredients or tags', async () => {
    setupGetDishWithRelations(makeDish());

    const result = await createDish(
      { name: 'Pasta', type: 'main', description: '', instructions: '' },
      'user-1'
    );

    expect(result.name).toBe('Pasta');
    expect(mockDb.insert).toHaveBeenCalledOnce(); // just the dish insert
  });

  it('creates dish with ingredients', async () => {
    setupGetDishWithRelations(makeDish());

    await createDish(
      {
        name: 'Pasta',
        type: 'main',
        description: '',
        instructions: '',
        ingredients: [{ name: 'Flour', quantity: 200, unit: 'g', notes: null }],
      },
      'user-1'
    );

    expect(mockDb.insert).toHaveBeenCalledTimes(2); // dish + ingredients
  });

  it('creates dish with new tags (find-or-create)', async () => {
    mockDb.query.tags.findFirst.mockResolvedValueOnce(undefined); // tag not found
    setupGetDishWithRelations(makeDish());

    await createDish(
      { name: 'Pasta', type: 'main', description: '', instructions: '', tags: ['italian'] },
      'user-1'
    );

    // inserts: dish, new tag, dishTag link
    expect(mockDb.insert).toHaveBeenCalledTimes(3);
  });

  it('creates dish with existing tag', async () => {
    mockDb.query.tags.findFirst.mockResolvedValueOnce({ id: 'tag-1', name: 'italian' });
    setupGetDishWithRelations(makeDish());

    await createDish(
      { name: 'Pasta', type: 'main', description: '', instructions: '', tags: ['italian'] },
      'user-1'
    );

    // inserts: dish, dishTag link (no new tag insert)
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });

  it('creates dish with dietary tags', async () => {
    setupGetDishWithRelations(makeDish());

    await createDish(
      {
        name: 'Salad',
        type: 'side',
        description: '',
        instructions: '',
        dietaryTags: ['vegan'],
      },
      'user-1'
    );

    expect(mockDb.insert).toHaveBeenCalledTimes(2); // dish + dietary tags
  });
});

// ===========================================================================
// updateDish
// ===========================================================================

describe('updateDish', () => {
  it('returns null when dish not found', async () => {
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(undefined);
    const result = await updateDish('nonexistent', { name: 'New Name' });
    expect(result).toBeNull();
  });

  it('updates dish fields and returns updated dish', async () => {
    const dish = makeDish();
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(dish);
    setupGetDishWithRelations({ ...dish, name: 'New Pasta' });

    const result = await updateDish('dish-1', { name: 'New Pasta' });

    expect(mockDb.update).toHaveBeenCalledOnce();
    expect(result?.name).toBe('New Pasta');
  });

  it('replaces ingredients when provided', async () => {
    const dish = makeDish();
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(dish);
    setupGetDishWithRelations(dish);

    await updateDish('dish-1', {
      ingredients: [{ name: 'Salt', quantity: 1, unit: 'tsp', notes: null }],
    });

    expect(mockDb.delete).toHaveBeenCalledOnce(); // delete old ingredients
    expect(mockDb.insert).toHaveBeenCalledOnce(); // insert new ingredients
  });

  it('deletes ingredients when empty array provided', async () => {
    const dish = makeDish();
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(dish);
    setupGetDishWithRelations(dish);

    await updateDish('dish-1', { ingredients: [] });

    expect(mockDb.delete).toHaveBeenCalledOnce(); // delete old, nothing new
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('replaces tags when provided', async () => {
    const dish = makeDish();
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(dish);
    mockDb.query.tags.findFirst.mockResolvedValueOnce(undefined); // new tag
    setupGetDishWithRelations(dish);

    await updateDish('dish-1', { tags: ['mexican'] });

    // deletes old tags link, inserts new tag + dishTag link
    expect(mockDb.delete).toHaveBeenCalledOnce();
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });

  it('replaces dietary tags when provided', async () => {
    const dish = makeDish();
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(dish);
    setupGetDishWithRelations(dish);

    await updateDish('dish-1', { dietaryTags: ['vegan'] });

    expect(mockDb.delete).toHaveBeenCalledOnce(); // delete old dietary tags
    expect(mockDb.insert).toHaveBeenCalledOnce(); // insert new dietary tags
  });

  it('clears dietary tags when empty array provided', async () => {
    const dish = makeDish();
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(dish);
    setupGetDishWithRelations(dish);

    await updateDish('dish-1', { dietaryTags: [] });

    expect(mockDb.delete).toHaveBeenCalledOnce();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// getAllTags
// ===========================================================================

describe('getAllTags', () => {
  it('returns empty array when no tags', async () => {
    mockDb.select.mockReturnValueOnce(selLeftJoinGroupByOrderBy([]));

    const result = await getAllTags();

    expect(result).toEqual([]);
  });

  it('returns tags with count', async () => {
    mockDb.select.mockReturnValueOnce(selLeftJoinGroupByOrderBy([{ name: 'italian', count: 3 }]));

    const result = await getAllTags();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('italian');
    expect(result[0].count).toBe(3);
  });
});

// ===========================================================================
// getDishesByIds
// ===========================================================================

describe('getDishesByIds', () => {
  it('returns empty array for empty ids', async () => {
    const result = await getDishesByIds([]);
    expect(result).toEqual([]);
  });

  it('fetches each dish by id', async () => {
    setupGetDishWithRelations(makeDish());

    const result = await getDishesByIds(['dish-1']);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('dish-1');
  });
});
