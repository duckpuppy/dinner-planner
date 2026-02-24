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

vi.mock('drizzle-orm', () => ({ eq: vi.fn().mockReturnValue(null) }));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    appSettings: { id: null, weekStartDay: null },
    weeklyMenus: { weekStartDate: null, id: null },
    dinnerEntries: { id: null, menuId: null, date: null },
    dishes: { id: null },
    users: { id: null },
    preparations: { id: null, dishId: null, dinnerEntryId: null },
    preparationPreparers: { preparationId: null, userId: null },
    entrySideDishes: { entryId: null, dishId: null },
    ratings: { preparationId: null },
  },
}));

import { updateDinnerEntry, deletePreparation, setSkipped } from '../services/menus.js';

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
  vi.clearAllMocks();
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
