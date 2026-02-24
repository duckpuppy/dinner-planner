import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mocks (hoisted so imports resolve after)
// ============================================================================

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  query: {
    appSettings: { findFirst: vi.fn() },
    weeklyMenus: { findFirst: vi.fn() },
    dinnerEntries: { findFirst: vi.fn() },
    dishes: { findFirst: vi.fn() },
    users: { findFirst: vi.fn() },
    preparations: { findFirst: vi.fn() },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
  and: vi.fn().mockReturnValue(null),
  inArray: vi.fn().mockReturnValue(null),
  gte: vi.fn().mockReturnValue(null),
  lte: vi.fn().mockReturnValue(null),
  desc: vi.fn().mockReturnValue(null),
  isNotNull: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    appSettings: { id: null, weekStartDay: null },
    weeklyMenus: { weekStartDate: null, id: null },
    dinnerEntries: { id: null, menuId: null, date: null, completed: null, mainDishId: null },
    dishes: { id: null },
    users: { id: null },
    preparations: { id: null, dishId: null, dinnerEntryId: null },
    preparationPreparers: { preparationId: null, userId: null },
    entrySideDishes: { entryId: null, dishId: null },
    ratings: { preparationId: null },
  },
}));

import {
  updateDinnerEntry,
  getRecentCompleted,
  type DinnerEntryResponse,
} from '../services/menus.js';

import { getHistory } from '../services/history.js';

// ============================================================================
// Chain helpers
// ============================================================================

function selWhere(result: unknown[]) {
  return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(result) }) };
}

function selFromWhereOrderBy(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

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

function makeUpdate() {
  return { set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) };
}

function makeDelete() {
  return { where: vi.fn().mockResolvedValue(undefined) };
}

function makeInsert() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    menuId: 'menu-1',
    date: '2024-01-15',
    type: 'assembled' as const,
    mainDishId: null as string | null,
    customText: null as string | null,
    restaurantName: null,
    restaurantNotes: null,
    sourceEntryId: null as string | null,
    completed: false,
    skipped: false,
    createdAt: '2024-01-15T00:00:00.000Z',
    updatedAt: '2024-01-15T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Set up mocks for getEntryWithRelations(entryId).
 * For entries with no main dish and no preparations, this is:
 *   1. dinnerEntries.findFirst → entry
 *   2. select().from(entrySideDishes).where() → []
 *   3. select().from(preparations).where() → []
 *   (no preparationPreparers because preps array is empty)
 *   (no sourceEntry lookup when sourceEntryId is null)
 */
function setupGetEntryWithRelations(
  entry: ReturnType<typeof makeEntry>,
  opts: { sourceEntryMainDishName?: string | null } = {}
) {
  // 1. dinnerEntries.findFirst
  mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);

  // 2. If entry has sourceEntryId, will also fetch the source entry
  if (entry.sourceEntryId) {
    const sourceEntry = makeEntry({
      id: entry.sourceEntryId,
      mainDishId: opts.sourceEntryMainDishName ? 'source-dish-1' : null,
    });
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(sourceEntry);
    if (opts.sourceEntryMainDishName) {
      mockDb.query.dishes.findFirst.mockResolvedValueOnce({
        id: 'source-dish-1',
        name: opts.sourceEntryMainDishName,
        type: 'main',
      });
    }
  }

  mockDb.select.mockReturnValueOnce(selWhere([])); // side dish links
  mockDb.select.mockReturnValueOnce(selWhere([])); // preparations
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.update.mockReturnValue(makeUpdate());
  mockDb.delete.mockReturnValue(makeDelete());
  mockDb.insert.mockReturnValue(makeInsert());
});

// ============================================================================
// updateDinnerEntry — leftovers type
// ============================================================================

describe('updateDinnerEntry — leftovers', () => {
  it('persists sourceEntryId when type is leftovers', async () => {
    const entry = makeEntry();
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    setupGetEntryWithRelations(makeEntry({ sourceEntryId: 'source-entry-1' }), {
      sourceEntryMainDishName: 'Spaghetti Bolognese',
    });

    const updateSpy = makeUpdate();
    mockDb.update.mockReturnValueOnce(updateSpy);

    await updateDinnerEntry('entry-1', {
      type: 'leftovers',
      sourceEntryId: 'source-entry-1',
      sideDishIds: [],
    });

    expect(updateSpy.set).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'leftovers', sourceEntryId: 'source-entry-1' })
    );
  });

  it('clears sourceEntryId when type changes away from leftovers', async () => {
    const entry = makeEntry({ type: 'leftovers', sourceEntryId: 'source-entry-1' });
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    setupGetEntryWithRelations(makeEntry());

    const updateSpy = makeUpdate();
    mockDb.update.mockReturnValueOnce(updateSpy);

    await updateDinnerEntry('entry-1', {
      type: 'assembled',
      sideDishIds: [],
    });

    expect(updateSpy.set).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'assembled', sourceEntryId: null })
    );
  });

  it('returns sourceEntryDishName in response when sourceEntryId is set', async () => {
    const entry = makeEntry({ type: 'leftovers', sourceEntryId: 'source-entry-1' });
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    setupGetEntryWithRelations(entry, { sourceEntryMainDishName: 'Chicken Curry' });

    mockDb.update.mockReturnValueOnce(makeUpdate());

    const result = await updateDinnerEntry('entry-1', {
      type: 'leftovers',
      sourceEntryId: 'source-entry-1',
      sideDishIds: [],
    });

    expect(result).not.toBeNull();
    expect((result as DinnerEntryResponse).sourceEntryId).toBe('source-entry-1');
    expect((result as DinnerEntryResponse).sourceEntryDishName).toBe('Chicken Curry');
  });

  it('returns sourceEntryDishName as null when sourceEntryId is null', async () => {
    const entry = makeEntry({ type: 'assembled' });
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    setupGetEntryWithRelations(entry);

    mockDb.update.mockReturnValueOnce(makeUpdate());

    const result = await updateDinnerEntry('entry-1', {
      type: 'assembled',
      sideDishIds: [],
    });

    expect(result).not.toBeNull();
    expect((result as DinnerEntryResponse).sourceEntryId).toBeNull();
    expect((result as DinnerEntryResponse).sourceEntryDishName).toBeNull();
  });
});

// ============================================================================
// getRecentCompleted
// ============================================================================

describe('getRecentCompleted', () => {
  it('returns entries completed in last 14 days that have a main dish', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const recent = makeEntry({
      id: 'entry-recent',
      date: today,
      mainDishId: 'dish-1',
      completed: true,
    });

    mockDb.select.mockReturnValueOnce(selFromWhereOrderBy([recent]));
    mockDb.query.dishes.findFirst.mockResolvedValueOnce({
      id: 'dish-1',
      name: 'Lasagne',
      type: 'main',
    });

    const result = await getRecentCompleted();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'entry-recent', date: today, mainDishName: 'Lasagne' });
  });

  it('excludes entries older than 14 days', async () => {
    const old = new Date();
    old.setDate(old.getDate() - 15);
    const oldDate = old.toISOString().slice(0, 10);

    const oldEntry = makeEntry({
      id: 'entry-old',
      date: oldDate,
      mainDishId: 'dish-1',
      completed: true,
    });

    mockDb.select.mockReturnValueOnce(selFromWhereOrderBy([oldEntry]));

    const result = await getRecentCompleted();

    expect(result).toHaveLength(0);
  });

  it('excludes entries without a main dish', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const entry = makeEntry({
      id: 'entry-no-dish',
      date: today,
      mainDishId: null,
      completed: true,
    });

    mockDb.select.mockReturnValueOnce(selFromWhereOrderBy([entry]));

    const result = await getRecentCompleted();

    expect(result).toHaveLength(0);
  });

  it('returns empty array when no recent completed entries', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhereOrderBy([]));

    const result = await getRecentCompleted();

    expect(result).toEqual([]);
  });
});

// ============================================================================
// getHistory — leftovers entries include sourceEntryDishName
// ============================================================================

describe('getHistory — leftovers entries', () => {
  it('includes sourceEntryId and sourceEntryDishName in history entries', async () => {
    const leftoversEntry = {
      id: 'entry-leftover',
      date: '2024-01-20',
      type: 'leftovers' as const,
      customText: null,
      mainDishId: null,
      sourceEntryId: 'source-entry-1',
      completed: true,
    };

    // Main query: select().from().where(and(...)).orderBy().limit().offset()
    mockDb.select.mockReturnValueOnce(selFromWhereOrderByLimitOffset([leftoversEntry]));
    // side dishes
    mockDb.select.mockReturnValueOnce(selWhere([]));
    // preparations
    mockDb.select.mockReturnValueOnce(selWhere([]));
    // source entry lookup
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(
      makeEntry({ id: 'source-entry-1', mainDishId: 'dish-source' })
    );
    // source dish lookup
    mockDb.query.dishes.findFirst.mockResolvedValueOnce({
      id: 'dish-source',
      name: 'Roast Chicken',
      type: 'main',
    });

    const result = await getHistory({});

    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0];
    expect(entry.type).toBe('leftovers');
    expect(entry.sourceEntryId).toBe('source-entry-1');
    expect(entry.sourceEntryDishName).toBe('Roast Chicken');
  });

  it('sets sourceEntryDishName to null when sourceEntryId is null', async () => {
    const assembledEntry = {
      id: 'entry-assembled',
      date: '2024-01-20',
      type: 'assembled' as const,
      customText: null,
      mainDishId: null,
      sourceEntryId: null,
      completed: true,
    };

    mockDb.select.mockReturnValueOnce(selFromWhereOrderByLimitOffset([assembledEntry]));
    mockDb.select.mockReturnValueOnce(selWhere([])); // side dishes
    mockDb.select.mockReturnValueOnce(selWhere([])); // preparations

    const result = await getHistory({});

    expect(result.entries[0].sourceEntryId).toBeNull();
    expect(result.entries[0].sourceEntryDishName).toBeNull();
  });
});
