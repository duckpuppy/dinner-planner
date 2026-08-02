/**
 * Unit tests for stores service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  query: {
    stores: { findFirst: vi.fn() },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
  and: vi.fn().mockReturnValue(null),
  asc: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    stores: { name: null, id: null, familyId: null },
    ingredientStores: { storeId: null },
  },
}));

vi.mock('crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('new-uuid'),
}));

import { listStores, findOrCreateStore, deleteStore, isStoreInFamily } from '../services/stores.js';

const FAMILY_ID = 'family-1';
const OTHER_FAMILY_ID = 'family-2';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function selectFromWhereOrderBy(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function selectFromWhereLimitOnly(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// listStores
// ---------------------------------------------------------------------------

describe('listStores', () => {
  it('returns empty array when no stores exist', async () => {
    mockDb.select.mockReturnValueOnce(selectFromWhereOrderBy([]));
    const result = await listStores(FAMILY_ID);
    expect(result).toEqual([]);
  });

  it('returns stores sorted by name', async () => {
    const stores = [
      { id: 's-1', familyId: FAMILY_ID, name: 'Aldi', createdAt: '2026-01-01T00:00:00.000Z' },
      {
        id: 's-2',
        familyId: FAMILY_ID,
        name: 'Whole Foods',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    mockDb.select.mockReturnValueOnce(selectFromWhereOrderBy(stores));
    const result = await listStores(FAMILY_ID);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Aldi');
    expect(result[1].name).toBe('Whole Foods');
  });
});

// ---------------------------------------------------------------------------
// findOrCreateStore
// ---------------------------------------------------------------------------

describe('findOrCreateStore', () => {
  it('returns existing store when found by name', async () => {
    const existing = {
      id: 's-1',
      familyId: FAMILY_ID,
      name: "Trader Joe's",
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    mockDb.select.mockReturnValueOnce(selectFromWhereLimitOnly([existing]));

    const result = await findOrCreateStore("Trader Joe's", FAMILY_ID);
    expect(result).toEqual(existing);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('creates and returns a new store when not found', async () => {
    mockDb.select.mockReturnValueOnce(selectFromWhereLimitOnly([]));
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const result = await findOrCreateStore('  Costco  ', FAMILY_ID);
    expect(result.id).toBe('new-uuid');
    expect(result.name).toBe('Costco'); // trimmed
    expect(mockDb.insert).toHaveBeenCalledOnce();
  });

  it('trims whitespace from name before lookup', async () => {
    const existing = {
      id: 's-2',
      familyId: FAMILY_ID,
      name: 'Walmart',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    mockDb.select.mockReturnValueOnce(selectFromWhereLimitOnly([existing]));

    const result = await findOrCreateStore('  Walmart  ', FAMILY_ID);
    expect(result.name).toBe('Walmart');
  });

  it('creates a same-named store independently per family (no cross-family reuse)', async () => {
    // Family B has no "Costco" of its own -- the family-scoped lookup finds
    // nothing even though family A has one, so a new store is created.
    mockDb.select.mockReturnValueOnce(selectFromWhereLimitOnly([]));
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const result = await findOrCreateStore('Costco', OTHER_FAMILY_ID);
    expect(result.id).toBe('new-uuid');
    expect(mockDb.insert).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// isStoreInFamily
// ---------------------------------------------------------------------------

describe('isStoreInFamily', () => {
  it('returns true when the store belongs to the family', async () => {
    mockDb.query.stores.findFirst.mockResolvedValueOnce({ id: 's-1', familyId: FAMILY_ID });
    const result = await isStoreInFamily('s-1', FAMILY_ID);
    expect(result).toBe(true);
  });

  it('returns false when the store belongs to another family', async () => {
    mockDb.query.stores.findFirst.mockResolvedValueOnce(undefined);
    const result = await isStoreInFamily('s-1', OTHER_FAMILY_ID);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deleteStore
// ---------------------------------------------------------------------------

describe('deleteStore', () => {
  it('returns false when store belongs to another family (cross-family 404)', async () => {
    mockDb.query.stores.findFirst.mockResolvedValueOnce(undefined);
    const result = await deleteStore('s-1', OTHER_FAMILY_ID);
    expect(result).toBe(false);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('returns false when store is still referenced by ingredient_stores', async () => {
    mockDb.query.stores.findFirst.mockResolvedValueOnce({ id: 's-1', familyId: FAMILY_ID });
    const usages = [{ ingredientId: 'ing-1', storeId: 's-1' }];
    mockDb.select.mockReturnValueOnce(selectFromWhereLimitOnly(usages));

    const result = await deleteStore('s-1', FAMILY_ID);
    expect(result).toBe(false);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('deletes and returns true when store has no usages', async () => {
    mockDb.query.stores.findFirst.mockResolvedValueOnce({ id: 's-1', familyId: FAMILY_ID });
    mockDb.select.mockReturnValueOnce(selectFromWhereLimitOnly([]));
    mockDb.delete.mockReturnValueOnce({
      where: vi.fn().mockResolvedValue({ changes: 1 }),
    });

    const result = await deleteStore('s-1', FAMILY_ID);
    expect(result).toBe(true);
    expect(mockDb.delete).toHaveBeenCalledOnce();
  });

  it('returns false when delete affects 0 rows (store not found)', async () => {
    mockDb.query.stores.findFirst.mockResolvedValueOnce({ id: 's-1', familyId: FAMILY_ID });
    mockDb.select.mockReturnValueOnce(selectFromWhereLimitOnly([]));
    mockDb.delete.mockReturnValueOnce({
      where: vi.fn().mockResolvedValue({ changes: 0 }),
    });

    const result = await deleteStore('s-1', FAMILY_ID);
    expect(result).toBe(false);
  });
});
