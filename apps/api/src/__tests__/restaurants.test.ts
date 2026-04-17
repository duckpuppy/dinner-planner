/**
 * Service unit tests for restaurants (mocked db).
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
    restaurants: { findFirst: vi.fn() },
    users: { findFirst: vi.fn() },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
  and: vi.fn().mockReturnValue(null),
  like: vi.fn().mockReturnValue(null),
  desc: vi.fn().mockReturnValue(null),
  asc: vi.fn().mockReturnValue(null),
  sql: Object.assign(vi.fn().mockReturnValue(null), { join: vi.fn().mockReturnValue(null) }),
  isNotNull: vi.fn().mockReturnValue(null),
  inArray: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    restaurants: {
      id: null,
      name: null,
      cuisineType: null,
      location: null,
      notes: null,
      archived: null,
      createdById: null,
      createdAt: null,
      updatedAt: null,
    },
    preparations: { restaurantId: null, preparedDate: null },
    restaurantDishes: { id: null, restaurantId: null },
    restaurantDishRatings: { stars: null, restaurantDishId: null },
    users: { id: null, displayName: null },
    dinnerEntries: { restaurantId: null },
  },
}));

import {
  listRestaurants,
  getRestaurantById,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
} from '../services/restaurants.js';

// --- Chain helpers ---

/** select().from().where() */
function selFromWhere(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

/** select().from().innerJoin().where() — for rating avg */
function selFromJoinWhere(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

/** select().from().where().orderBy().limit() — for last visit */
function selFromWhereOrderByLimit(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(result),
        }),
      }),
    }),
  };
}

/** select().from().where().orderBy().limit().offset() — for listRestaurants rows */
function selFromWhereOrderByLimitOffset(result: unknown[]) {
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

function makeRestaurantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rest-1',
    name: 'Pizza Palace',
    cuisineType: 'Italian',
    location: '123 Main St',
    notes: 'Great place',
    archived: false,
    createdById: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    displayName: 'Alice',
    ...overrides,
  };
}

/**
 * Mock the 3 db.select() calls that getRestaurantStats makes:
 * 1. visit count: select({ count }).from(preparations).where()
 * 2. avg rating: select({ avg }).from(restaurantDishRatings).innerJoin(restaurantDishes).where()
 * 3. last visit: select({ preparedDate }).from(preparations).where().orderBy().limit()
 */
function mockStats(
  visitCount = 0,
  avgRating: number | null = null,
  lastVisit: string | null = null
) {
  mockDb.select.mockReturnValueOnce(selFromWhere([{ count: visitCount }]));
  mockDb.select.mockReturnValueOnce(selFromJoinWhere([{ avg: avgRating }]));
  mockDb.select.mockReturnValueOnce(
    selFromWhereOrderByLimit(lastVisit ? [{ preparedDate: lastVisit }] : [])
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.insert.mockReturnValue(makeInsert());
  mockDb.update.mockReturnValue(makeUpdate());
  mockDb.delete.mockReturnValue(makeDelete());
});

// ===========================================================================
// listRestaurants
// ===========================================================================

describe('listRestaurants', () => {
  const baseQuery = {
    archived: false,
    limit: 20,
    offset: 0,
    sort: 'name' as const,
    order: 'asc' as const,
  };

  it('returns empty list when no restaurants exist', async () => {
    // count query
    mockDb.select.mockReturnValueOnce(selFromWhere([{ count: 0 }]));
    // rows query
    mockDb.select.mockReturnValueOnce(selFromWhereOrderByLimitOffset([]));

    const result = await listRestaurants(baseQuery);
    expect(result.total).toBe(0);
    expect(result.restaurants).toEqual([]);
  });

  it('returns restaurants with stats and creator', async () => {
    const row = makeRestaurantRow();

    // count
    mockDb.select.mockReturnValueOnce(selFromWhere([{ count: 1 }]));
    // rows
    mockDb.select.mockReturnValueOnce(selFromWhereOrderByLimitOffset([row]));
    // buildRestaurantResponse: creator lookup
    mockDb.query.users.findFirst.mockResolvedValueOnce(makeUserRow());
    // stats: 3 selects
    mockStats(2, 4.5, '2026-03-01');

    const result = await listRestaurants(baseQuery);

    expect(result.total).toBe(1);
    expect(result.restaurants).toHaveLength(1);
    const r = result.restaurants[0];
    expect(r.id).toBe('rest-1');
    expect(r.name).toBe('Pizza Palace');
    expect(r.createdBy).toEqual({ id: 'user-1', displayName: 'Alice' });
    expect(r.visitCount).toBe(2);
    expect(r.averageRating).toBe(4.5);
    expect(r.lastVisitedAt).toBe('2026-03-01');
  });

  it('handles multiple restaurants, each with their own stats', async () => {
    const row1 = makeRestaurantRow({ id: 'rest-1', name: 'Alpha' });
    const row2 = makeRestaurantRow({ id: 'rest-2', name: 'Beta' });

    // count
    mockDb.select.mockReturnValueOnce(selFromWhere([{ count: 2 }]));
    // rows
    mockDb.select.mockReturnValueOnce(selFromWhereOrderByLimitOffset([row1, row2]));
    // rest-1: creator + stats
    mockDb.query.users.findFirst.mockResolvedValueOnce(makeUserRow());
    mockStats(1, 3.0, '2026-02-01');
    // rest-2: creator + stats
    mockDb.query.users.findFirst.mockResolvedValueOnce(
      makeUserRow({ id: 'user-2', displayName: 'Bob' })
    );
    mockStats(0, null, null);

    const result = await listRestaurants(baseQuery);

    expect(result.total).toBe(2);
    expect(result.restaurants).toHaveLength(2);
    expect(result.restaurants[0].name).toBe('Alpha');
    expect(result.restaurants[1].name).toBe('Beta');
    expect(result.restaurants[1].visitCount).toBe(0);
    expect(result.restaurants[1].averageRating).toBeNull();
  });

  it('uses creator displayName "Unknown" when user not found', async () => {
    const row = makeRestaurantRow();

    mockDb.select.mockReturnValueOnce(selFromWhere([{ count: 1 }]));
    mockDb.select.mockReturnValueOnce(selFromWhereOrderByLimitOffset([row]));
    mockDb.query.users.findFirst.mockResolvedValueOnce(undefined);
    mockStats(0, null, null);

    const result = await listRestaurants(baseQuery);
    expect(result.restaurants[0].createdBy.displayName).toBe('Unknown');
  });

  it('handles search filter', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhere([{ count: 0 }]));
    mockDb.select.mockReturnValueOnce(selFromWhereOrderByLimitOffset([]));

    const result = await listRestaurants({ ...baseQuery, search: 'pizza' });
    expect(result.total).toBe(0);
    expect(result.restaurants).toEqual([]);
  });

  it('handles sort by created date desc', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhere([{ count: 0 }]));
    mockDb.select.mockReturnValueOnce(selFromWhereOrderByLimitOffset([]));

    const result = await listRestaurants({ ...baseQuery, sort: 'created', order: 'desc' });
    expect(result.total).toBe(0);
  });

  it('handles sort by recent (falls through to asc name)', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhere([{ count: 0 }]));
    mockDb.select.mockReturnValueOnce(selFromWhereOrderByLimitOffset([]));

    const result = await listRestaurants({ ...baseQuery, sort: 'recent' as 'name' });
    expect(result.total).toBe(0);
  });
});

// ===========================================================================
// getRestaurantById
// ===========================================================================

describe('getRestaurantById', () => {
  it('returns null when restaurant not found', async () => {
    mockDb.query.restaurants.findFirst.mockResolvedValueOnce(undefined);
    const result = await getRestaurantById('nonexistent');
    expect(result).toBeNull();
  });

  it('returns full RestaurantResponse when found', async () => {
    const row = makeRestaurantRow();
    mockDb.query.restaurants.findFirst.mockResolvedValueOnce(row);
    mockDb.query.users.findFirst.mockResolvedValueOnce(makeUserRow());
    mockStats(5, 4.2, '2026-03-15');

    const result = await getRestaurantById('rest-1');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('rest-1');
    expect(result!.name).toBe('Pizza Palace');
    expect(result!.cuisineType).toBe('Italian');
    expect(result!.location).toBe('123 Main St');
    expect(result!.archived).toBe(false);
    expect(result!.createdBy).toEqual({ id: 'user-1', displayName: 'Alice' });
    expect(result!.visitCount).toBe(5);
    expect(result!.averageRating).toBe(4.2);
    expect(result!.lastVisitedAt).toBe('2026-03-15');
  });

  it('handles null optional fields', async () => {
    const row = makeRestaurantRow({ cuisineType: null, location: null, notes: null });
    mockDb.query.restaurants.findFirst.mockResolvedValueOnce(row);
    mockDb.query.users.findFirst.mockResolvedValueOnce(makeUserRow());
    mockStats(0, null, null);

    const result = await getRestaurantById('rest-1');

    expect(result!.cuisineType).toBeNull();
    expect(result!.location).toBeNull();
    expect(result!.notes).toBeNull();
    expect(result!.averageRating).toBeNull();
    expect(result!.lastVisitedAt).toBeNull();
  });
});

// ===========================================================================
// createRestaurant
// ===========================================================================

describe('createRestaurant', () => {
  it('inserts a restaurant and returns the full response', async () => {
    const row = makeRestaurantRow();

    // createRestaurant calls getRestaurantById internally after insert
    mockDb.query.restaurants.findFirst.mockResolvedValueOnce(row);
    mockDb.query.users.findFirst.mockResolvedValueOnce(makeUserRow());
    mockStats(0, null, null);

    const result = await createRestaurant(
      {
        name: 'Pizza Palace',
        cuisineType: 'Italian',
        location: '123 Main St',
        notes: 'Great place',
      },
      'user-1'
    );

    expect(mockDb.insert).toHaveBeenCalledOnce();
    expect(result.name).toBe('Pizza Palace');
    expect(result.archived).toBe(false);
    expect(result.createdBy.id).toBe('user-1');
  });

  it('handles optional fields omitted', async () => {
    const row = makeRestaurantRow({ cuisineType: null, location: null, notes: null });

    mockDb.query.restaurants.findFirst.mockResolvedValueOnce(row);
    mockDb.query.users.findFirst.mockResolvedValueOnce(makeUserRow());
    mockStats(0, null, null);

    const result = await createRestaurant({ name: 'Pizza Palace' }, 'user-1');

    expect(result.cuisineType).toBeNull();
    expect(result.location).toBeNull();
    expect(result.notes).toBeNull();
  });
});

// ===========================================================================
// updateRestaurant
// ===========================================================================

describe('updateRestaurant', () => {
  it('returns null when restaurant not found', async () => {
    mockDb.query.restaurants.findFirst.mockResolvedValueOnce(undefined);
    const result = await updateRestaurant('nonexistent', { name: 'New Name' });
    expect(result).toBeNull();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('updates and returns the updated restaurant', async () => {
    const existing = makeRestaurantRow();
    const updatedRow = makeRestaurantRow({ name: 'New Name' });

    // First findFirst: existence check in updateRestaurant
    mockDb.query.restaurants.findFirst.mockResolvedValueOnce(existing);
    // Second findFirst: inside getRestaurantById called at the end of updateRestaurant
    mockDb.query.restaurants.findFirst.mockResolvedValueOnce(updatedRow);
    mockDb.query.users.findFirst.mockResolvedValueOnce(makeUserRow());
    mockStats(1, 3.5, '2026-02-01');

    const result = await updateRestaurant('rest-1', { name: 'New Name' });

    expect(mockDb.update).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
    expect(result!.name).toBe('New Name');
  });

  it('handles partial updates (only archived flag)', async () => {
    const existing = makeRestaurantRow();
    const updatedRow = makeRestaurantRow({ archived: true });

    mockDb.query.restaurants.findFirst.mockResolvedValueOnce(existing);
    mockDb.query.restaurants.findFirst.mockResolvedValueOnce(updatedRow);
    mockDb.query.users.findFirst.mockResolvedValueOnce(makeUserRow());
    mockStats(0, null, null);

    const result = await updateRestaurant('rest-1', { archived: true });

    expect(result!.archived).toBe(true);
  });

  it('handles all fields being updated', async () => {
    const existing = makeRestaurantRow();
    const updatedRow = makeRestaurantRow({
      name: 'Sushi Spot',
      cuisineType: 'Japanese',
      location: '456 Oak Ave',
      notes: 'Amazing sushi',
      archived: false,
    });

    mockDb.query.restaurants.findFirst.mockResolvedValueOnce(existing);
    mockDb.query.restaurants.findFirst.mockResolvedValueOnce(updatedRow);
    mockDb.query.users.findFirst.mockResolvedValueOnce(makeUserRow());
    mockStats(3, 4.8, '2026-03-20');

    const result = await updateRestaurant('rest-1', {
      name: 'Sushi Spot',
      cuisineType: 'Japanese',
      location: '456 Oak Ave',
      notes: 'Amazing sushi',
      archived: false,
    });

    expect(result!.name).toBe('Sushi Spot');
    expect(result!.cuisineType).toBe('Japanese');
  });
});

// ===========================================================================
// deleteRestaurant
// ===========================================================================

describe('deleteRestaurant', () => {
  it('returns { success: false, error } when restaurant not found', async () => {
    mockDb.query.restaurants.findFirst.mockResolvedValueOnce(undefined);
    const result = await deleteRestaurant('nonexistent');
    expect(result).toEqual({ success: false, error: 'Restaurant not found' });
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('nullifies FK references and deletes when found', async () => {
    const existing = makeRestaurantRow();
    mockDb.query.restaurants.findFirst.mockResolvedValueOnce(existing);

    const result = await deleteRestaurant('rest-1');

    expect(result).toEqual({ success: true });
    // update called twice: dinnerEntries nullification + preparations nullification
    expect(mockDb.update).toHaveBeenCalledTimes(2);
    expect(mockDb.delete).toHaveBeenCalledOnce();
  });
});
