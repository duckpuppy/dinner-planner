/**
 * Service unit tests for standingItems (mocked db).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Mock db before importing services
// ============================================================

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  query: {
    standingItems: { findFirst: vi.fn() },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
  asc: vi.fn().mockReturnValue(null),
  inArray: vi.fn().mockReturnValue(null),
  desc: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    standingItems: {
      id: null,
      name: null,
      quantity: null,
      unit: null,
      category: null,
      storeId: null,
      createdBy: null,
    },
    stores: {
      id: null,
      name: null,
    },
  },
}));

import {
  listStandingItems,
  addStandingItem,
  deleteStandingItem,
} from '../services/standingItems.js';

// --- Chain helpers ---

function selFromOrderBy(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function selFromWhere(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function makeInsert() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

function makeDelete() {
  return { where: vi.fn().mockResolvedValue(undefined) };
}

// --- Fixtures ---

function makeItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'si-1',
    name: 'Milk',
    quantity: 2,
    unit: 'litre',
    category: 'Dairy',
    storeId: null,
    storeName: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.insert.mockReturnValue(makeInsert());
  mockDb.delete.mockReturnValue(makeDelete());
});

// ===========================================================================
// listStandingItems
// ===========================================================================

describe('listStandingItems', () => {
  it('returns empty array when no items exist', async () => {
    mockDb.select.mockReturnValueOnce(selFromOrderBy([]));
    const result = await listStandingItems();
    expect(result).toEqual([]);
  });

  it('returns items sorted by name (as returned by db)', async () => {
    const row1 = makeItemRow({ id: 'si-1', name: 'Eggs' });
    const row2 = makeItemRow({ id: 'si-2', name: 'Milk' });
    mockDb.select.mockReturnValueOnce(selFromOrderBy([row1, row2]));

    const result = await listStandingItems();
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Eggs');
    expect(result[1].name).toBe('Milk');
  });

  it('maps all fields correctly including storeName from join', async () => {
    const row = makeItemRow({ storeId: 's-1', storeName: 'Aldi' });
    mockDb.select.mockReturnValueOnce(selFromOrderBy([row]));

    const [result] = await listStandingItems();
    expect(result).toEqual({
      id: 'si-1',
      name: 'Milk',
      quantity: 2,
      unit: 'litre',
      category: 'Dairy',
      storeId: 's-1',
      storeName: 'Aldi',
    });
  });

  it('maps null optional fields to null', async () => {
    const row = makeItemRow({ quantity: null, unit: null, storeId: null, storeName: null });
    mockDb.select.mockReturnValueOnce(selFromOrderBy([row]));

    const [result] = await listStandingItems();
    expect(result.quantity).toBeNull();
    expect(result.unit).toBeNull();
    expect(result.storeId).toBeNull();
    expect(result.storeName).toBeNull();
  });
});

// ===========================================================================
// addStandingItem
// ===========================================================================

describe('addStandingItem', () => {
  it('inserts and returns the new item', async () => {
    const row = makeItemRow();
    mockDb.select.mockReturnValueOnce(selFromWhere([row]));

    const result = await addStandingItem('Milk', 2, 'litre', 'Dairy', null, 'user-1');

    expect(mockDb.insert).toHaveBeenCalledOnce();
    expect(result.name).toBe('Milk');
    expect(result.quantity).toBe(2);
    expect(result.unit).toBe('litre');
    expect(result.category).toBe('Dairy');
  });

  it('handles null quantity and unit', async () => {
    const row = makeItemRow({ quantity: null, unit: null });
    mockDb.select.mockReturnValueOnce(selFromWhere([row]));

    const result = await addStandingItem('Bread', null, null, 'Other', null, 'user-1');
    expect(result.quantity).toBeNull();
    expect(result.unit).toBeNull();
  });

  it('stores storeId when provided', async () => {
    const row = makeItemRow({ storeId: 's-1', storeName: 'Costco' });
    mockDb.select.mockReturnValueOnce(selFromWhere([row]));

    const result = await addStandingItem('Butter', 1, 'lb', 'Dairy', 's-1', 'user-1');
    expect(result.storeId).toBe('s-1');
    expect(result.storeName).toBe('Costco');
  });

  it('returns item with default category Other when not specified', async () => {
    const row = makeItemRow({ category: 'Other', quantity: null, unit: null });
    mockDb.select.mockReturnValueOnce(selFromWhere([row]));

    const result = await addStandingItem('Eggs', null, null, 'Other', null, 'user-1');
    expect(result.category).toBe('Other');
  });
});

// ===========================================================================
// deleteStandingItem
// ===========================================================================

describe('deleteStandingItem', () => {
  it('returns false when id not found', async () => {
    mockDb.query.standingItems.findFirst.mockResolvedValueOnce(undefined);
    const result = await deleteStandingItem('nonexistent');
    expect(result).toBe(false);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('returns true and deletes on success', async () => {
    const existing = makeItemRow();
    mockDb.query.standingItems.findFirst.mockResolvedValueOnce(existing);

    const result = await deleteStandingItem('si-1');

    expect(result).toBe(true);
    expect(mockDb.delete).toHaveBeenCalledOnce();
  });
});
