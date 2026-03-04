import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  desc: vi.fn().mockReturnValue(null),
  gte: vi.fn().mockReturnValue(null),
  isNotNull: vi.fn().mockReturnValue(null),
  sql: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    appSettings: { id: null, weekStartDay: null },
    weeklyMenus: { weekStartDate: null, id: null },
    dinnerEntries: {
      id: null,
      menuId: null,
      date: null,
      completed: null,
      mainDishId: null,
      scale: null,
    },
    dishes: { id: null, name: null },
    users: { id: null },
    preparations: { id: null, dishId: null, dinnerEntryId: null, preparedDate: null },
    preparationPreparers: { preparationId: null, userId: null },
    entrySideDishes: { entryId: null, dishId: null },
    ratings: { preparationId: null },
  },
}));

import {
  updateDinnerEntry,
  deletePreparation,
  setSkipped,
  markEntryCompleted,
  logPreparation,
  getDishPreparations,
  getRecentCompleted,
  getOrCreateWeekMenu,
} from '../services/menus.js';

// --- Chain helpers ---

function selWhere(result: unknown[]) {
  return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(result) }) };
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
    date: '2024-01-01',
    type: 'assembled' as const,
    mainDishId: null as string | null,
    customText: null as string | null,
    restaurantName: null,
    restaurantNotes: null,
    completed: false,
    skipped: false,
    scale: 1,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...overrides,
  };
}

function makePrep(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prep-1',
    dishId: 'dish-1',
    dinnerEntryId: 'entry-1',
    preparedDate: '2024-01-01',
    notes: null,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...overrides,
  };
}

/**
 * Set up mocks for getEntryWithRelations(entryId):
 * 1. db.query.dinnerEntries.findFirst() → entry
 * 2. db.select().from(entrySideDishes).where() → []
 * 3. db.select().from(preparations).where() → []
 * (No preparationPreparers select because preparations array is empty)
 */
function setupGetEntryWithRelations(entry: ReturnType<typeof makeEntry>) {
  mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
  mockDb.select.mockReturnValueOnce(selWhere([])); // side dish links
  mockDb.select.mockReturnValueOnce(selWhere([])); // preparations (empty → no preparationPreparers selects)
}

beforeEach(() => {
  vi.resetAllMocks();
  mockDb.update.mockReturnValue(makeUpdate());
  mockDb.delete.mockReturnValue(makeDelete());
  mockDb.insert.mockReturnValue(makeInsert());
});

// ===========================================================================
// updateDinnerEntry
// ===========================================================================

describe('updateDinnerEntry', () => {
  it('returns null when entry not found', async () => {
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(undefined);
    const result = await updateDinnerEntry('nonexistent', {
      type: 'assembled',
      sideDishIds: [],
    });
    expect(result).toBeNull();
  });

  it('calls db.update on the entry', async () => {
    const entry = makeEntry();
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    setupGetEntryWithRelations(entry);

    await updateDinnerEntry('entry-1', { type: 'fend_for_self', sideDishIds: [] });
    expect(mockDb.update).toHaveBeenCalledOnce();
  });

  it('always deletes existing side dishes', async () => {
    const entry = makeEntry();
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    setupGetEntryWithRelations(entry);

    await updateDinnerEntry('entry-1', { type: 'assembled', sideDishIds: [] });
    expect(mockDb.delete).toHaveBeenCalledOnce();
  });

  it('inserts new side dishes when sideDishIds provided', async () => {
    const entry = makeEntry();
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    setupGetEntryWithRelations(entry);

    await updateDinnerEntry('entry-1', {
      type: 'assembled',
      mainDishId: 'dish-1',
      sideDishIds: ['side-1', 'side-2'],
    });
    expect(mockDb.insert).toHaveBeenCalledOnce();
  });

  it('does not insert side dishes when sideDishIds is empty', async () => {
    const entry = makeEntry();
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    setupGetEntryWithRelations(entry);

    await updateDinnerEntry('entry-1', { type: 'assembled', sideDishIds: [] });
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('does not insert side dishes when sideDishIds is undefined', async () => {
    const entry = makeEntry();
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    setupGetEntryWithRelations(entry);

    await updateDinnerEntry('entry-1', { type: 'assembled' });
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('persists scale when provided', async () => {
    const entry = makeEntry();
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    setupGetEntryWithRelations(entry);

    await updateDinnerEntry('entry-1', { type: 'assembled', sideDishIds: [], scale: 3 });

    const updateCall = mockDb.update().set;
    expect(updateCall).toHaveBeenCalledWith(expect.objectContaining({ scale: 3 }));
  });
});

// ===========================================================================
// deletePreparation
// ===========================================================================

describe('deletePreparation', () => {
  it('returns {success: false, error} when preparation not found', async () => {
    mockDb.query.preparations.findFirst.mockResolvedValueOnce(undefined);
    const result = await deletePreparation('nonexistent');
    expect(result).toEqual({ success: false, error: 'Preparation not found' });
  });

  it('returns {success: true} after successful delete', async () => {
    mockDb.query.preparations.findFirst.mockResolvedValueOnce(makePrep());
    mockDb.select.mockReturnValueOnce(selWhere([])); // no remaining preps
    const result = await deletePreparation('prep-1');
    expect(result).toEqual({ success: true });
  });

  it('marks entry as not completed when last preparation is deleted', async () => {
    mockDb.query.preparations.findFirst.mockResolvedValueOnce(makePrep());
    mockDb.select.mockReturnValueOnce(selWhere([])); // no remaining preps after delete
    await deletePreparation('prep-1');
    expect(mockDb.update).toHaveBeenCalledOnce();
  });

  it('does not update entry completed when other preparations remain', async () => {
    mockDb.query.preparations.findFirst.mockResolvedValueOnce(makePrep());
    // Another prep still exists for this entry
    mockDb.select.mockReturnValueOnce(selWhere([makePrep({ id: 'prep-2' })]));
    await deletePreparation('prep-1');
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('deletes the preparation record', async () => {
    mockDb.query.preparations.findFirst.mockResolvedValueOnce(makePrep());
    mockDb.select.mockReturnValueOnce(selWhere([]));
    await deletePreparation('prep-1');
    expect(mockDb.delete).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// setSkipped
// ===========================================================================

describe('setSkipped', () => {
  it('returns null when entry not found', async () => {
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(undefined);
    const result = await setSkipped('nonexistent', true);
    expect(result).toBeNull();
  });

  it('calls db.update to set skipped=true', async () => {
    const entry = makeEntry();
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    setupGetEntryWithRelations(entry);

    await setSkipped('entry-1', true);
    expect(mockDb.update).toHaveBeenCalledOnce();
  });

  it('calls db.update to set skipped=false', async () => {
    const entry = makeEntry({ skipped: true });
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    setupGetEntryWithRelations(entry);

    await setSkipped('entry-1', false);
    expect(mockDb.update).toHaveBeenCalledOnce();
  });

  it('does not modify completed field', async () => {
    const entry = makeEntry({ completed: true });
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    setupGetEntryWithRelations(entry);

    await setSkipped('entry-1', true);

    const updateCall = mockDb.update.mock.results[0].value;
    const setArgs = updateCall.set.mock.calls[0][0];
    expect(setArgs).not.toHaveProperty('completed');
    expect(setArgs).toHaveProperty('skipped', true);
  });
});

// Additional chain helpers for new tests
function selFromWhere(result: unknown[]) {
  return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(result) }) };
}

function selFromWhereOrderByDescDate(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue(result) }),
    }),
  };
}

// ===========================================================================
// markEntryCompleted
// ===========================================================================

describe('markEntryCompleted', () => {
  it('returns null when entry not found', async () => {
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(undefined);
    const result = await markEntryCompleted('nonexistent', true);
    expect(result).toBeNull();
  });

  it('calls db.update to set completed=true', async () => {
    const entry = makeEntry();
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    setupGetEntryWithRelations(entry);

    await markEntryCompleted('entry-1', true);
    expect(mockDb.update).toHaveBeenCalledOnce();
  });

  it('calls db.update to set completed=false', async () => {
    const entry = makeEntry({ completed: true });
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    setupGetEntryWithRelations(entry);

    await markEntryCompleted('entry-1', false);
    expect(mockDb.update).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// logPreparation
// ===========================================================================

describe('logPreparation', () => {
  it('inserts preparation, preparers, and auto-completes entry', async () => {
    mockDb.query.dishes.findFirst.mockResolvedValueOnce({ id: 'dish-1', name: 'Pasta' });
    // db.select().from(users).where() for preparers
    mockDb.select.mockReturnValueOnce(selFromWhere([{ id: 'user-1', displayName: 'Alice' }]));

    const result = await logPreparation({
      dishId: 'dish-1',
      dinnerEntryId: 'entry-1',
      preparerIds: ['user-1'],
      notes: 'Great dinner',
    });

    expect(result.dishName).toBe('Pasta');
    expect(result.preparers).toHaveLength(1);
    expect(result.preparers[0].name).toBe('Alice');
    expect(result.notes).toBe('Great dinner');
    // 2 inserts: preparation + preparers; 1 update: auto-complete entry
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
    expect(mockDb.update).toHaveBeenCalledOnce();
  });

  it('uses "Unknown" when dish not found', async () => {
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(undefined);
    mockDb.select.mockReturnValueOnce(selFromWhere([]));

    const result = await logPreparation({
      dishId: 'dish-x',
      dinnerEntryId: 'entry-1',
      preparerIds: [],
      notes: null,
    });

    expect(result.dishName).toBe('Unknown');
    expect(result.notes).toBeNull();
  });
});

// ===========================================================================
// getDishPreparations
// ===========================================================================

describe('getDishPreparations', () => {
  it('returns empty array when no preparations', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhere([]));
    const result = await getDishPreparations('dish-1');
    expect(result).toEqual([]);
  });

  it('returns preparations sorted by date descending', async () => {
    const preps = [
      { ...makePrep({ id: 'prep-1', preparedDate: '2024-01-01' }) },
      { ...makePrep({ id: 'prep-2', preparedDate: '2024-01-10' }) },
    ];
    // db.select().from(preparations).where() → preps
    mockDb.select.mockReturnValueOnce(selFromWhere(preps));
    // fetchPreparersMap: db.select().from(preparationPreparers).where() → []
    mockDb.select.mockReturnValueOnce(selFromWhere([]));
    // getDishWithRelations for prep-1
    mockDb.query.dishes.findFirst.mockResolvedValueOnce({ id: 'dish-1', name: 'Pasta' });
    // getDishWithRelations for prep-2
    mockDb.query.dishes.findFirst.mockResolvedValueOnce({ id: 'dish-1', name: 'Pasta' });

    const result = await getDishPreparations('dish-1');

    expect(result).toHaveLength(2);
    // sorted desc: 2024-01-10 first
    expect(result[0].preparedDate).toBe('2024-01-10');
    expect(result[1].preparedDate).toBe('2024-01-01');
  });
});

// ===========================================================================
// getRecentCompleted
// ===========================================================================

describe('getRecentCompleted', () => {
  it('returns empty array when no completed entries', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhereOrderByDescDate([]));
    const result = await getRecentCompleted();
    expect(result).toEqual([]);
  });

  it('returns entries with mainDishName', async () => {
    const entries = [{ id: 'entry-1', date: '2024-01-10', mainDishId: 'dish-1', completed: true }];
    mockDb.select.mockReturnValueOnce(selFromWhereOrderByDescDate(entries));
    // db.select().from(dishes).where() → dish rows
    mockDb.select.mockReturnValueOnce(selFromWhere([{ id: 'dish-1', name: 'Pasta' }]));

    const result = await getRecentCompleted();

    expect(result).toHaveLength(1);
    expect(result[0].mainDishName).toBe('Pasta');
    expect(result[0].id).toBe('entry-1');
  });

  it('filters out entries whose dish is not in dishMap', async () => {
    const entries = [
      { id: 'entry-1', date: '2024-01-10', mainDishId: 'dish-missing', completed: true },
    ];
    mockDb.select.mockReturnValueOnce(selFromWhereOrderByDescDate(entries));
    mockDb.select.mockReturnValueOnce(selFromWhere([])); // no dish rows

    const result = await getRecentCompleted();

    expect(result).toEqual([]);
  });
});

// ===========================================================================
// updateDinnerEntry - leftovers validation branches
// ===========================================================================

describe('updateDinnerEntry leftovers validation', () => {
  it('returns null when sourceEntryId equals entryId (self-reference)', async () => {
    const entry = makeEntry();
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);

    const result = await updateDinnerEntry('entry-1', {
      type: 'leftovers',
      sourceEntryId: 'entry-1',
      sideDishIds: [],
    });

    expect(result).toBeNull();
  });

  it('returns null when source entry not found', async () => {
    const entry = makeEntry();
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(undefined); // source not found

    const result = await updateDinnerEntry('entry-1', {
      type: 'leftovers',
      sourceEntryId: 'entry-2',
      sideDishIds: [],
    });

    expect(result).toBeNull();
  });

  it('returns null when source entry is also leftovers (no chaining)', async () => {
    const entry = makeEntry();
    const sourceEntry = makeEntry({ id: 'entry-2', type: 'leftovers' });
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(sourceEntry);

    const result = await updateDinnerEntry('entry-1', {
      type: 'leftovers',
      sourceEntryId: 'entry-2',
      sideDishIds: [],
    });

    expect(result).toBeNull();
  });

  it('clears sourceEntryId when type changes away from leftovers', async () => {
    const entry = makeEntry({ type: 'leftovers' });
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    setupGetEntryWithRelations(makeEntry());

    await updateDinnerEntry('entry-1', { type: 'assembled', sideDishIds: [] });

    const updateCall = mockDb.update.mock.results[0].value;
    const setArgs = updateCall.set.mock.calls[0][0];
    expect(setArgs.sourceEntryId).toBeNull();
  });

  it('sets sourceEntryId when leftovers type with valid source', async () => {
    const entry = makeEntry();
    const sourceEntry = makeEntry({ id: 'entry-2', type: 'assembled' });
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(sourceEntry);
    setupGetEntryWithRelations(makeEntry());

    await updateDinnerEntry('entry-1', {
      type: 'leftovers',
      sourceEntryId: 'entry-2',
      sideDishIds: [],
    });

    const updateCall = mockDb.update.mock.results[0].value;
    const setArgs = updateCall.set.mock.calls[0][0];
    expect(setArgs.sourceEntryId).toBe('entry-2');
  });
});

// ===========================================================================
// getEntryWithRelations via updateDinnerEntry — covers branch paths
// with mainDish, sideDishes, preparations, preparers, sourceEntryId
// ===========================================================================

/**
 * Sets up mocks for getEntryWithRelations with rich data:
 * - entry has mainDishId, sourceEntryId
 * - one side dish
 * - one preparation with one preparer
 */
function setupGetEntryWithRichRelations(entry: ReturnType<typeof makeEntry>) {
  mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);

  // main dish lookup
  if (entry.mainDishId) {
    mockDb.query.dishes.findFirst.mockResolvedValueOnce({
      id: entry.mainDishId,
      name: 'Pasta',
      type: 'main',
    });
  }

  // side dish links
  mockDb.select.mockReturnValueOnce(selWhere([{ entryId: entry.id, dishId: 'side-1' }]));
  // side dish lookup
  mockDb.query.dishes.findFirst.mockResolvedValueOnce({
    id: 'side-1',
    name: 'Salad',
    type: 'side',
  });

  // preparations
  const prep = makePrep({ id: 'prep-1', dishId: 'dish-1', dinnerEntryId: entry.id });
  mockDb.select.mockReturnValueOnce(selWhere([prep]));

  // fetchPreparersMap: preparationPreparers
  mockDb.select.mockReturnValueOnce(selWhere([{ preparationId: 'prep-1', userId: 'user-1' }]));
  // fetchPreparersMap: users
  mockDb.select.mockReturnValueOnce(selWhere([{ id: 'user-1', displayName: 'Alice' }]));

  // preparation dish lookup
  mockDb.query.dishes.findFirst.mockResolvedValueOnce({ id: 'dish-1', name: 'Pasta' });

  // sourceEntryId dish name lookup (if sourceEntryId set)
  if (entry.sourceEntryId) {
    const leftJoinResult = [{ dishName: 'Tacos' }];
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(leftJoinResult),
          }),
        }),
      }),
    });
  }
}

describe('getEntryWithRelations rich paths (via updateDinnerEntry)', () => {
  it('includes mainDish when entry has mainDishId', async () => {
    const entry = makeEntry({ mainDishId: 'dish-1' });
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    setupGetEntryWithRichRelations(entry);

    const result = await updateDinnerEntry('entry-1', { type: 'assembled', sideDishIds: [] });

    expect(result?.mainDish).not.toBeNull();
    expect(result?.mainDish?.name).toBe('Pasta');
  });

  it('includes sideDishes when entry has side dish links', async () => {
    const entry = makeEntry();
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    setupGetEntryWithRichRelations(entry);

    const result = await updateDinnerEntry('entry-1', { type: 'assembled', sideDishIds: [] });

    expect(result?.sideDishes).toHaveLength(1);
    expect(result?.sideDishes[0].name).toBe('Salad');
  });

  it('includes preparations with preparers', async () => {
    const entry = makeEntry();
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    setupGetEntryWithRichRelations(entry);

    const result = await updateDinnerEntry('entry-1', { type: 'assembled', sideDishIds: [] });

    expect(result?.preparations).toHaveLength(1);
    expect(result?.preparations[0].preparers).toHaveLength(1);
    expect(result?.preparations[0].preparers[0].name).toBe('Alice');
  });

  it('includes sourceEntryDishName for leftovers entries', async () => {
    const entry = makeEntry({ sourceEntryId: 'source-1' });
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry); // updateDinnerEntry findFirst
    // sourceEntry validation
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(
      makeEntry({ id: 'source-1', type: 'assembled' })
    );

    // getEntryWithRelations
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    // No mainDish
    // side dish links (empty)
    mockDb.select.mockReturnValueOnce(selWhere([]));
    // preparations (empty)
    mockDb.select.mockReturnValueOnce(selWhere([]));
    // sourceEntryId dish name lookup
    mockDb.select.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ dishName: 'Tacos' }]),
          }),
        }),
      }),
    });

    const result = await updateDinnerEntry('entry-1', {
      type: 'leftovers',
      sourceEntryId: 'source-1',
      sideDishIds: [],
    });

    expect(result?.sourceEntryDishName).toBe('Tacos');
  });

  it('returns null mainDish when dish query returns nothing', async () => {
    const entry = makeEntry({ mainDishId: 'dish-missing' });
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    // getEntryWithRelations
    mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
    mockDb.query.dishes.findFirst.mockResolvedValueOnce(undefined); // dish not found
    mockDb.select.mockReturnValueOnce(selWhere([])); // no side dishes
    mockDb.select.mockReturnValueOnce(selWhere([])); // no preparations

    const result = await updateDinnerEntry('entry-1', { type: 'assembled', sideDishIds: [] });

    expect(result?.mainDish).toBeNull();
  });
});

// ===========================================================================
// getOrCreateWeekMenu — covers menu creation path
// ===========================================================================

describe('getOrCreateWeekMenu', () => {
  function selFromWhere(result: unknown[]) {
    return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(result) }) };
  }

  it('returns existing menu when found', async () => {
    const menu = { id: 'menu-1', weekStartDate: '2024-01-01', createdAt: '', updatedAt: '' };
    mockDb.query.appSettings.findFirst.mockResolvedValueOnce({ weekStartDay: 0 });
    mockDb.query.weeklyMenus.findFirst.mockResolvedValueOnce(menu);
    // Get entries for menu
    mockDb.select.mockReturnValueOnce(selFromWhere([]));

    const result = await getOrCreateWeekMenu('2024-01-03');

    expect(result.id).toBe('menu-1');
    expect(result.entries).toHaveLength(0);
  });

  it('creates new menu with 7 entries when not found', async () => {
    mockDb.query.appSettings.findFirst.mockResolvedValueOnce({ weekStartDay: 0 });
    mockDb.query.weeklyMenus.findFirst.mockResolvedValueOnce(undefined); // not found

    // After creation, fetch menu by id
    const newMenu = { id: 'new-menu', weekStartDate: '2024-01-01', createdAt: '', updatedAt: '' };
    mockDb.query.weeklyMenus.findFirst.mockResolvedValueOnce(newMenu);

    // Get entries for new menu (7 entries)
    const entries = Array.from({ length: 7 }, (_, i) =>
      makeEntry({ id: `entry-${i}`, menuId: 'new-menu', date: `2024-01-0${i + 1}` })
    );
    mockDb.select.mockReturnValueOnce(selFromWhere(entries));

    // getEntryWithRelations for each of 7 entries — each needs:
    // findFirst (entry), select (side dishes), select (preparations)
    for (const entry of entries) {
      mockDb.query.dinnerEntries.findFirst.mockResolvedValueOnce(entry);
      mockDb.select.mockReturnValueOnce(selWhere([])); // side dishes
      mockDb.select.mockReturnValueOnce(selWhere([])); // preparations
    }

    const result = await getOrCreateWeekMenu('2024-01-03');

    expect(result.id).toBe('new-menu');
    // 1 insert for menu + 7 inserts for entries
    expect(mockDb.insert).toHaveBeenCalledTimes(8);
  });
});
