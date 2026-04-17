/**
 * Service unit tests for restaurantDishes (mocked db).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Mock db before importing services
// ============================================================

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  query: {
    restaurantDishes: { findFirst: vi.fn() },
    restaurantDishRatings: { findFirst: vi.fn() },
    users: { findFirst: vi.fn() },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
  and: vi.fn().mockReturnValue(null),
  sql: Object.assign(vi.fn().mockReturnValue(null), { join: vi.fn().mockReturnValue(null) }),
  inArray: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    restaurantDishes: {
      id: null,
      restaurantId: null,
      name: null,
      notes: null,
      createdAt: null,
      updatedAt: null,
    },
    restaurantDishRatings: {
      id: null,
      restaurantDishId: null,
      userId: null,
      stars: null,
      note: null,
      createdAt: null,
      updatedAt: null,
    },
    users: { id: null, displayName: null },
  },
}));

import {
  listDishesByRestaurant,
  createRestaurantDish,
  updateRestaurantDish,
  deleteRestaurantDish,
  getDishRatings,
  addDishRating,
  updateDishRating,
} from '../services/restaurantDishes.js';

// --- Chain helpers ---

/**
 * Universal thenable chain — supports any combination of Drizzle query builder
 * methods. When `await`ed at any point in the chain, resolves with `result`.
 */
function makeSelectChain(result: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  chain.then = (onFulfilled?: (v: unknown[]) => void) => {
    if (onFulfilled) onFulfilled(result);
    return chain;
  };
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(chain);
  return chain;
}

function makeInsert() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

function makeUpdate() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

function makeDelete() {
  return { where: vi.fn().mockResolvedValue(undefined) };
}

// --- Fixtures ---

function makeDishRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dish-1',
    restaurantId: 'rest-1',
    name: 'Margherita Pizza',
    notes: 'Classic',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRatingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rating-1',
    restaurantDishId: 'dish-1',
    userId: 'user-1',
    stars: 5,
    note: 'Delicious!',
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Mock the single db.select() call that buildDishResponse makes:
 * select({ avg, count }).from(restaurantDishRatings).where()
 */
function mockDishStats(avg: number | null = null, count = 0) {
  mockDb.select.mockReturnValueOnce(makeSelectChain([{ avg, count }]));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.insert.mockReturnValue(makeInsert());
  mockDb.update.mockReturnValue(makeUpdate());
  mockDb.delete.mockReturnValue(makeDelete());
});

// ===========================================================================
// listDishesByRestaurant
// ===========================================================================

describe('listDishesByRestaurant', () => {
  it('returns empty array when no dishes exist', async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const result = await listDishesByRestaurant('rest-1');
    expect(result).toEqual([]);
  });

  it('returns dishes with rating stats', async () => {
    const dish = makeDishRow();
    mockDb.select.mockReturnValueOnce(makeSelectChain([dish]));
    // buildDishResponse stats select
    mockDishStats(4.0, 3);

    const result = await listDishesByRestaurant('rest-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('dish-1');
    expect(result[0].name).toBe('Margherita Pizza');
    expect(result[0].restaurantId).toBe('rest-1');
    expect(result[0].averageRating).toBe(4.0);
    expect(result[0].ratingCount).toBe(3);
  });

  it('returns multiple dishes each with their own stats', async () => {
    const dish1 = makeDishRow({ id: 'dish-1', name: 'Margherita Pizza' });
    const dish2 = makeDishRow({ id: 'dish-2', name: 'Tiramisu' });
    mockDb.select.mockReturnValueOnce(makeSelectChain([dish1, dish2]));
    mockDishStats(4.5, 2);
    mockDishStats(3.0, 1);

    const result = await listDishesByRestaurant('rest-1');

    expect(result).toHaveLength(2);
    expect(result[0].averageRating).toBe(4.5);
    expect(result[1].averageRating).toBe(3.0);
  });

  it('returns null averageRating when no ratings', async () => {
    const dish = makeDishRow();
    mockDb.select.mockReturnValueOnce(makeSelectChain([dish]));
    mockDishStats(null, 0);

    const result = await listDishesByRestaurant('rest-1');

    expect(result[0].averageRating).toBeNull();
    expect(result[0].ratingCount).toBe(0);
  });
});

// ===========================================================================
// createRestaurantDish
// ===========================================================================

describe('createRestaurantDish', () => {
  it('inserts a dish and returns the full response', async () => {
    const dish = makeDishRow();

    mockDb.query.restaurantDishes.findFirst.mockResolvedValueOnce(dish);
    mockDishStats(null, 0);

    const result = await createRestaurantDish('rest-1', {
      name: 'Margherita Pizza',
      notes: 'Classic',
    });

    expect(mockDb.insert).toHaveBeenCalledOnce();
    expect(result.name).toBe('Margherita Pizza');
    expect(result.restaurantId).toBe('rest-1');
    expect(result.averageRating).toBeNull();
    expect(result.ratingCount).toBe(0);
  });

  it('handles optional notes being omitted', async () => {
    const dish = makeDishRow({ notes: null });

    mockDb.query.restaurantDishes.findFirst.mockResolvedValueOnce(dish);
    mockDishStats(null, 0);

    const result = await createRestaurantDish('rest-1', { name: 'Margherita Pizza' });

    expect(result.notes).toBeNull();
  });
});

// ===========================================================================
// updateRestaurantDish
// ===========================================================================

describe('updateRestaurantDish', () => {
  it('returns null when dish not found', async () => {
    mockDb.query.restaurantDishes.findFirst.mockResolvedValueOnce(undefined);
    const result = await updateRestaurantDish('nonexistent', { name: 'New Name' });
    expect(result).toBeNull();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('updates name and returns updated dish', async () => {
    const existing = makeDishRow();
    const updatedDish = makeDishRow({ name: 'Pepperoni Pizza' });

    // First findFirst: existence check
    mockDb.query.restaurantDishes.findFirst.mockResolvedValueOnce(existing);
    // Second findFirst: after update
    mockDb.query.restaurantDishes.findFirst.mockResolvedValueOnce(updatedDish);
    mockDishStats(4.0, 2);

    const result = await updateRestaurantDish('dish-1', { name: 'Pepperoni Pizza' });

    expect(mockDb.update).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Pepperoni Pizza');
  });

  it('updates notes only', async () => {
    const existing = makeDishRow();
    const updatedDish = makeDishRow({ notes: 'Updated notes' });

    mockDb.query.restaurantDishes.findFirst.mockResolvedValueOnce(existing);
    mockDb.query.restaurantDishes.findFirst.mockResolvedValueOnce(updatedDish);
    mockDishStats(null, 0);

    const result = await updateRestaurantDish('dish-1', { notes: 'Updated notes' });

    expect(result!.notes).toBe('Updated notes');
  });
});

// ===========================================================================
// deleteRestaurantDish
// ===========================================================================

describe('deleteRestaurantDish', () => {
  it('returns { success: false, error } when dish not found', async () => {
    mockDb.query.restaurantDishes.findFirst.mockResolvedValueOnce(undefined);
    const result = await deleteRestaurantDish('nonexistent');
    expect(result).toEqual({ success: false, error: 'Dish not found' });
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('deletes and returns { success: true } when found', async () => {
    const existing = makeDishRow();
    mockDb.query.restaurantDishes.findFirst.mockResolvedValueOnce(existing);

    const result = await deleteRestaurantDish('dish-1');

    expect(result).toEqual({ success: true });
    expect(mockDb.delete).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// getDishRatings
// ===========================================================================

describe('getDishRatings', () => {
  it('returns empty array when no ratings exist', async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    const result = await getDishRatings('dish-1');
    expect(result).toEqual([]);
  });

  it('returns single rating with user info', async () => {
    const rating = makeRatingRow();
    // select ratings
    mockDb.select.mockReturnValueOnce(makeSelectChain([rating]));
    // select users (one userId)
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ id: 'user-1', displayName: 'Alice' }]));

    const result = await getDishRatings('dish-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('rating-1');
    expect(result[0].restaurantDishId).toBe('dish-1');
    expect(result[0].user).toEqual({ id: 'user-1', displayName: 'Alice' });
    expect(result[0].stars).toBe(5);
    expect(result[0].note).toBe('Delicious!');
  });

  it('returns multiple ratings with correct user mapping', async () => {
    const rating1 = makeRatingRow({ id: 'rating-1', userId: 'user-1', stars: 5 });
    const rating2 = makeRatingRow({ id: 'rating-2', userId: 'user-2', stars: 3, note: 'Good' });
    // select ratings
    mockDb.select.mockReturnValueOnce(makeSelectChain([rating1, rating2]));
    // select users (multiple userIds — uses sql`IN` path)
    mockDb.select.mockReturnValueOnce(
      makeSelectChain([
        { id: 'user-1', displayName: 'Alice' },
        { id: 'user-2', displayName: 'Bob' },
      ])
    );

    const result = await getDishRatings('dish-1');

    expect(result).toHaveLength(2);
    expect(result[0].user).toEqual({ id: 'user-1', displayName: 'Alice' });
    expect(result[1].user).toEqual({ id: 'user-2', displayName: 'Bob' });
    expect(result[1].stars).toBe(3);
  });

  it('uses "Unknown" displayName when user not in user map', async () => {
    const rating = makeRatingRow({ userId: 'missing-user' });
    mockDb.select.mockReturnValueOnce(makeSelectChain([rating]));
    // user lookup returns empty
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));

    const result = await getDishRatings('dish-1');

    expect(result[0].user.displayName).toBe('Unknown');
  });
});

// ===========================================================================
// addDishRating
// ===========================================================================

describe('addDishRating', () => {
  it('inserts new rating when none exists for this user+dish', async () => {
    // no existing rating
    mockDb.query.restaurantDishRatings.findFirst.mockResolvedValueOnce(undefined);
    // user lookup after insert
    mockDb.query.users.findFirst.mockResolvedValueOnce({ id: 'user-1', displayName: 'Alice' });

    const result = await addDishRating('dish-1', 'user-1', { stars: 4, note: 'Pretty good' });

    expect(mockDb.insert).toHaveBeenCalledOnce();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(result.stars).toBe(4);
    expect(result.note).toBe('Pretty good');
    expect(result.user).toEqual({ id: 'user-1', displayName: 'Alice' });
    expect(result.restaurantDishId).toBe('dish-1');
  });

  it('updates existing rating (upsert path) when rating exists', async () => {
    const existing = makeRatingRow({ stars: 3, note: 'OK' });
    mockDb.query.restaurantDishRatings.findFirst.mockResolvedValueOnce(existing);
    mockDb.query.users.findFirst.mockResolvedValueOnce({ id: 'user-1', displayName: 'Alice' });

    const result = await addDishRating('dish-1', 'user-1', { stars: 5, note: 'Amazing!' });

    expect(mockDb.update).toHaveBeenCalledOnce();
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(result.id).toBe('rating-1');
    expect(result.stars).toBe(5);
    expect(result.note).toBe('Amazing!');
  });

  it('uses "Unknown" when user not found after insert', async () => {
    mockDb.query.restaurantDishRatings.findFirst.mockResolvedValueOnce(undefined);
    mockDb.query.users.findFirst.mockResolvedValueOnce(undefined);

    const result = await addDishRating('dish-1', 'user-1', { stars: 3 });

    expect(result.user.displayName).toBe('Unknown');
  });

  it('handles rating with no note (null)', async () => {
    mockDb.query.restaurantDishRatings.findFirst.mockResolvedValueOnce(undefined);
    mockDb.query.users.findFirst.mockResolvedValueOnce({ id: 'user-1', displayName: 'Alice' });

    const result = await addDishRating('dish-1', 'user-1', { stars: 4 });

    expect(result.stars).toBe(4);
    expect(result.note).toBeUndefined();
  });
});

// ===========================================================================
// updateDishRating
// ===========================================================================

describe('updateDishRating', () => {
  it('returns null when rating not found', async () => {
    mockDb.query.restaurantDishRatings.findFirst.mockResolvedValueOnce(undefined);
    const result = await updateDishRating('nonexistent', { stars: 5 });
    expect(result).toBeNull();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('updates stars and returns updated rating', async () => {
    const existing = makeRatingRow();
    const updatedRating = makeRatingRow({ stars: 4 });

    // First findFirst: existence check
    mockDb.query.restaurantDishRatings.findFirst.mockResolvedValueOnce(existing);
    // user lookup
    mockDb.query.users.findFirst.mockResolvedValueOnce({ id: 'user-1', displayName: 'Alice' });
    // second findFirst: fetch updated rating
    mockDb.query.restaurantDishRatings.findFirst.mockResolvedValueOnce(updatedRating);

    const result = await updateDishRating('rating-1', { stars: 4 });

    expect(mockDb.update).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
    expect(result!.stars).toBe(4);
    expect(result!.user).toEqual({ id: 'user-1', displayName: 'Alice' });
  });

  it('updates note only', async () => {
    const existing = makeRatingRow();
    const updatedRating = makeRatingRow({ note: 'Updated note' });

    mockDb.query.restaurantDishRatings.findFirst.mockResolvedValueOnce(existing);
    mockDb.query.users.findFirst.mockResolvedValueOnce({ id: 'user-1', displayName: 'Alice' });
    mockDb.query.restaurantDishRatings.findFirst.mockResolvedValueOnce(updatedRating);

    const result = await updateDishRating('rating-1', { note: 'Updated note' });

    expect(result!.note).toBe('Updated note');
  });

  it('uses "Unknown" when user not found', async () => {
    const existing = makeRatingRow();
    const updatedRating = makeRatingRow();

    mockDb.query.restaurantDishRatings.findFirst.mockResolvedValueOnce(existing);
    mockDb.query.users.findFirst.mockResolvedValueOnce(undefined);
    mockDb.query.restaurantDishRatings.findFirst.mockResolvedValueOnce(updatedRating);

    const result = await updateDishRating('rating-1', { stars: 5 });

    expect(result!.user.displayName).toBe('Unknown');
  });
});
