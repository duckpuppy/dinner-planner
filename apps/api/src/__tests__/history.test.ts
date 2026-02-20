import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  delete: vi.fn(),
  query: {
    dishes: { findFirst: vi.fn() },
    users: { findFirst: vi.fn() },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
  and: vi.fn().mockReturnValue(null),
  gte: vi.fn().mockReturnValue(null),
  lte: vi.fn().mockReturnValue(null),
  desc: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    dinnerEntries: {
      id: null,
      date: null,
      completed: null,
      mainDishId: null,
      customText: null,
    },
    entrySideDishes: { entryId: null, dishId: null },
    preparations: { id: null, dinnerEntryId: null, dishId: null, preparedById: null },
    ratings: { id: null, preparationId: null, userId: null },
    dishes: { id: null },
    users: { id: null },
  },
}));

import { getHistory, getDishHistory, deleteHistoryEntry } from '../services/history.js';

// Chain builders matching the drizzle query patterns in history.ts

// select().from().where(and(...)).orderBy().limit().offset() — main entry query
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

// select().from().where() — side dishes, preparations, ratings
function selFromWhere(result: unknown[]) {
  return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(result) }) };
}

// select().from().where().orderBy() — getDishHistory preparations
function selFromWhereOrderBy(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue(result) }),
    }),
  };
}

function del() {
  return { where: vi.fn().mockResolvedValue(undefined) };
}

const mockEntry = {
  id: 'entry-1',
  date: '2024-01-15',
  type: 'assembled' as const,
  customText: null,
  completed: true,
  mainDishId: null,
};

const mockDish = { id: 'dish-1', name: 'Pasta' };
const mockUser = { id: 'user-1', displayName: 'Alice' };
const mockPrep = {
  id: 'prep-1',
  dishId: 'dish-1',
  dinnerEntryId: 'entry-1',
  preparedById: 'user-1',
  preparedDate: '2024-01-15',
  notes: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getHistory', () => {
  it('returns empty entries when no results', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhereOrderByLimitOffset([]));
    const result = await getHistory({});
    expect(result).toEqual({ entries: [], total: 0 });
  });

  it('enriches entry with main dish and side dishes', async () => {
    const entry = { ...mockEntry, mainDishId: 'dish-1' };
    mockDb.select.mockReturnValueOnce(selFromWhereOrderByLimitOffset([entry]));
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(mockDish); // main dish
    mockDb.select.mockReturnValueOnce(selFromWhere([])); // no side dishes
    mockDb.select.mockReturnValueOnce(selFromWhere([])); // no preparations

    const result = await getHistory({});
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].mainDish).toEqual({ id: 'dish-1', name: 'Pasta' });
    expect(result.entries[0].sideDishes).toHaveLength(0);
  });

  it('enriches entry with preparations and ratings', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhereOrderByLimitOffset([mockEntry]));
    mockDb.select.mockReturnValueOnce(selFromWhere([])); // no side dishes
    mockDb.select.mockReturnValueOnce(selFromWhere([mockPrep])); // preparations
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser); // preparer
    const mockRating = { id: 'r-1', stars: 5, userId: 'user-2' };
    mockDb.select.mockReturnValueOnce(selFromWhere([mockRating])); // ratings
    mockDb.query.users.findFirst.mockResolvedValueOnce({ id: 'user-2', displayName: 'Bob' }); // rater

    const result = await getHistory({});
    expect(result.entries[0].preparations).toHaveLength(1);
    expect(result.entries[0].preparations[0].preparedByName).toBe('Alice');
    expect(result.entries[0].preparations[0].ratings).toHaveLength(1);
    expect(result.entries[0].preparations[0].ratings[0].userName).toBe('Bob');
  });

  it('filters by search term (customText match)', async () => {
    const entryWithCustom = { ...mockEntry, mainDishId: null, customText: 'Pizza Night' };
    mockDb.select.mockReturnValueOnce(selFromWhereOrderByLimitOffset([entryWithCustom]));
    mockDb.select.mockReturnValueOnce(selFromWhere([])); // side dishes
    mockDb.select.mockReturnValueOnce(selFromWhere([])); // preparations

    const result = await getHistory({ search: 'pizza' });
    expect(result.entries).toHaveLength(1);
  });

  it('excludes entries that do not match search term', async () => {
    const entry = { ...mockEntry, mainDishId: 'dish-1', customText: null };
    mockDb.select.mockReturnValueOnce(selFromWhereOrderByLimitOffset([entry]));
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(mockDish); // dish name is "Pasta"

    const result = await getHistory({ search: 'tacos' }); // no match
    expect(result.entries).toHaveLength(0);
  });

  it('uses "Unknown" when preparer not found', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhereOrderByLimitOffset([mockEntry]));
    mockDb.select.mockReturnValueOnce(selFromWhere([])); // side dishes
    mockDb.select.mockReturnValueOnce(selFromWhere([mockPrep])); // preparations
    mockDb.query.users.findFirst.mockResolvedValueOnce(null); // preparer not found
    mockDb.select.mockReturnValueOnce(selFromWhere([])); // no ratings

    const result = await getHistory({});
    expect(result.entries[0].preparations[0].preparedByName).toBe('Unknown');
  });
});

describe('getDishHistory', () => {
  it('returns empty preparations when dish has none', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhereOrderBy([]));
    const result = await getDishHistory('dish-1');
    expect(result).toEqual({ preparations: [] });
  });

  it('returns preparations with ratings', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhereOrderBy([mockPrep]));
    mockDb.query.users.findFirst.mockResolvedValueOnce(mockUser);
    const mockRating = { id: 'r-1', stars: 4, note: 'Nice', userId: 'user-2' };
    mockDb.select.mockReturnValueOnce(selFromWhere([mockRating]));
    mockDb.query.users.findFirst.mockResolvedValueOnce({ id: 'user-2', displayName: 'Bob' });

    const result = await getDishHistory('dish-1');
    expect(result.preparations).toHaveLength(1);
    expect(result.preparations[0].preparedByName).toBe('Alice');
    expect(result.preparations[0].ratings).toHaveLength(1);
    expect(result.preparations[0].ratings[0].userName).toBe('Bob');
    expect(result.preparations[0].ratings[0].note).toBe('Nice');
  });

  it('uses "Unknown" when user not found', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhereOrderBy([mockPrep]));
    mockDb.query.users.findFirst.mockResolvedValueOnce(null);
    mockDb.select.mockReturnValueOnce(selFromWhere([]));

    const result = await getDishHistory('dish-1');
    expect(result.preparations[0].preparedByName).toBe('Unknown');
  });
});

describe('deleteHistoryEntry', () => {
  it('cascades deletion: ratings → preparations → side dishes → entry', async () => {
    // get preparations
    mockDb.select.mockReturnValueOnce(selFromWhere([mockPrep]));
    // delete ratings for prep
    mockDb.delete.mockReturnValueOnce(del());
    // delete all preparations
    mockDb.delete.mockReturnValueOnce(del());
    // delete side dish links
    mockDb.delete.mockReturnValueOnce(del());
    // delete entry
    mockDb.delete.mockReturnValueOnce(del());

    const result = await deleteHistoryEntry('entry-1');
    expect(result).toEqual({ success: true });
    expect(mockDb.delete).toHaveBeenCalledTimes(4);
  });

  it('handles entry with no preparations', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhere([])); // no preps
    mockDb.delete.mockReturnValueOnce(del()); // preparations (no-op)
    mockDb.delete.mockReturnValueOnce(del()); // side dishes
    mockDb.delete.mockReturnValueOnce(del()); // entry

    const result = await deleteHistoryEntry('entry-1');
    expect(result).toEqual({ success: true });
    expect(mockDb.delete).toHaveBeenCalledTimes(3);
  });
});
