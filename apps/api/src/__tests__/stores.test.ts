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
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
  asc: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    stores: { name: null, id: null },
    ingredientStores: { storeId: null },
  },
}));

vi.mock('crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('new-uuid'),
}));

import { listStores, findOrCreateStore, deleteStore } from '../services/stores.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function selectFromWhereLimitResult(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockResolvedValue(result),
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function selectFromOrderBy(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockResolvedValue(result),
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

// ---------------------------------------------------------------------------
// listStores
// ---------------------------------------------------------------------------

describe('listStores', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when no stores exist', async () => {
    mockDb.select.mockReturnValueOnce(selectFromOrderBy([]));
    const result = await listStores();
    expect(result).toEqual([]);
  });

  it('returns stores sorted by name', async () => {
    const stores = [
      { id: 's-1', name: 'Aldi', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 's-2', name: 'Whole Foods', createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    mockDb.select.mockReturnValueOnce(selectFromOrderBy(stores));
    const result = await listStores();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Aldi');
    expect(result[1].name).toBe('Whole Foods');
  });
});

// ---------------------------------------------------------------------------
// findOrCreateStore
// ---------------------------------------------------------------------------

describe('findOrCreateStore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns existing store when found by name', async () => {
    const existing = { id: 's-1', name: 'Trader Joe\'s', createdAt: '2026-01-01T00:00:00.000Z' };
    mockDb.select.mockReturnValueOnce(selectFromWhereLimitOnly([existing]));

    const result = await findOrCreateStore("Trader Joe's");
    expect(result).toEqual(existing);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('creates and returns a new store when not found', async () => {
    mockDb.select.mockReturnValueOnce(selectFromWhereLimitOnly([]));
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const result = await findOrCreateStore('  Costco  ');
    expect(result.id).toBe('new-uuid');
    expect(result.name).toBe('Costco'); // trimmed
    expect(mockDb.insert).toHaveBeenCalledOnce();
  });

  it('trims whitespace from name before lookup', async () => {
    const existing = { id: 's-2', name: 'Walmart', createdAt: '2026-01-01T00:00:00.000Z' };
    mockDb.select.mockReturnValueOnce(selectFromWhereLimitOnly([existing]));

    const result = await findOrCreateStore('  Walmart  ');
    expect(result.name).toBe('Walmart');
  });
});

// ---------------------------------------------------------------------------
// deleteStore
// ---------------------------------------------------------------------------

describe('deleteStore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns false when store is still referenced by ingredient_stores', async () => {
    const usages = [{ ingredientId: 'ing-1', storeId: 's-1' }];
    mockDb.select.mockReturnValueOnce(selectFromWhereLimitOnly(usages));

    const result = await deleteStore('s-1');
    expect(result).toBe(false);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('deletes and returns true when store has no usages', async () => {
    mockDb.select.mockReturnValueOnce(selectFromWhereLimitOnly([]));
    mockDb.delete.mockReturnValueOnce({
      where: vi.fn().mockResolvedValue({ changes: 1 }),
    });

    const result = await deleteStore('s-1');
    expect(result).toBe(true);
    expect(mockDb.delete).toHaveBeenCalledOnce();
  });

  it('returns false when delete affects 0 rows (store not found)', async () => {
    mockDb.select.mockReturnValueOnce(selectFromWhereLimitOnly([]));
    mockDb.delete.mockReturnValueOnce({
      where: vi.fn().mockResolvedValue({ changes: 0 }),
    });

    const result = await deleteStore('nonexistent');
    expect(result).toBe(false);
  });
});
