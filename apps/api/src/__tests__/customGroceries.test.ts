/**
 * Service unit tests for customGroceries (mocked db).
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
    customGroceryItems: { findFirst: vi.fn() },
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
    customGroceryItems: {
      id: null,
      weekDate: null,
      name: null,
      quantity: null,
      unit: null,
      sortOrder: null,
      createdAt: null,
    },
  },
}));

import {
  getCustomItemsForWeek,
  addCustomItem,
  updateCustomItem,
  deleteCustomItem,
} from '../services/customGroceries.js';

// --- Chain helpers ---

function selFrom(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function selFromWhere(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
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

function makeItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    weekDate: '2026-02-24',
    name: 'Milk',
    quantity: 2,
    unit: 'litre',
    sortOrder: 0,
    createdAt: '2026-02-24T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.insert.mockReturnValue(makeInsert());
  mockDb.update.mockReturnValue(makeUpdate());
  mockDb.delete.mockReturnValue(makeDelete());
});

// ===========================================================================
// getCustomItemsForWeek
// ===========================================================================

describe('getCustomItemsForWeek', () => {
  it('returns empty array when no items exist', async () => {
    mockDb.select.mockReturnValueOnce(selFrom([]));
    const result = await getCustomItemsForWeek('2026-02-24');
    expect(result).toEqual([]);
  });

  it('returns items ordered by sortOrder', async () => {
    const row1 = makeItemRow({ id: 'item-1', sortOrder: 0, name: 'Milk' });
    const row2 = makeItemRow({ id: 'item-2', sortOrder: 1, name: 'Eggs' });
    mockDb.select.mockReturnValueOnce(selFrom([row1, row2]));

    const result = await getCustomItemsForWeek('2026-02-24');
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Milk');
    expect(result[1].name).toBe('Eggs');
  });

  it('maps all fields correctly', async () => {
    const row = makeItemRow();
    mockDb.select.mockReturnValueOnce(selFrom([row]));

    const [result] = await getCustomItemsForWeek('2026-02-24');
    expect(result).toEqual({
      id: 'item-1',
      weekDate: '2026-02-24',
      name: 'Milk',
      quantity: 2,
      unit: 'litre',
      sortOrder: 0,
      createdAt: '2026-02-24T00:00:00.000Z',
    });
  });

  it('maps null optional fields to null', async () => {
    const row = makeItemRow({ quantity: null, unit: null });
    mockDb.select.mockReturnValueOnce(selFrom([row]));

    const [result] = await getCustomItemsForWeek('2026-02-24');
    expect(result.quantity).toBeNull();
    expect(result.unit).toBeNull();
  });
});

// ===========================================================================
// addCustomItem
// ===========================================================================

describe('addCustomItem', () => {
  it('inserts and returns the new item', async () => {
    const row = makeItemRow();
    // First select: existing items count (returns array)
    mockDb.select.mockReturnValueOnce(selFromWhere([]));
    // Second select: fetch inserted item by id
    mockDb.select.mockReturnValueOnce(selFromWhere([row]));

    const result = await addCustomItem('2026-02-24', 'Milk', 2, 'litre');

    expect(mockDb.insert).toHaveBeenCalledOnce();
    expect(result.name).toBe('Milk');
    expect(result.quantity).toBe(2);
    expect(result.unit).toBe('litre');
  });

  it('sets sortOrder to count of existing items', async () => {
    const existing = [makeItemRow({ id: 'existing-1' })];
    const newRow = makeItemRow({ id: 'item-2', sortOrder: 1 });
    mockDb.select.mockReturnValueOnce(selFromWhere(existing));
    mockDb.select.mockReturnValueOnce(selFromWhere([newRow]));

    const result = await addCustomItem('2026-02-24', 'Eggs', null, null);

    expect(result.sortOrder).toBe(1);
  });

  it('handles null quantity and unit', async () => {
    const row = makeItemRow({ quantity: null, unit: null });
    mockDb.select.mockReturnValueOnce(selFromWhere([]));
    mockDb.select.mockReturnValueOnce(selFromWhere([row]));

    const result = await addCustomItem('2026-02-24', 'Bread', null, null);
    expect(result.quantity).toBeNull();
    expect(result.unit).toBeNull();
  });
});

// ===========================================================================
// updateCustomItem
// ===========================================================================

describe('updateCustomItem', () => {
  it('returns null when id not found', async () => {
    mockDb.query.customGroceryItems.findFirst.mockResolvedValueOnce(undefined);
    const result = await updateCustomItem('nonexistent', { name: 'Butter' });
    expect(result).toBeNull();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('updates name and returns updated item', async () => {
    const existing = makeItemRow();
    const updated = makeItemRow({ name: 'Butter' });
    mockDb.query.customGroceryItems.findFirst.mockResolvedValueOnce(existing);
    mockDb.select.mockReturnValueOnce(selFromWhere([updated]));

    const result = await updateCustomItem('item-1', { name: 'Butter' });

    expect(mockDb.update).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Butter');
  });

  it('updates quantity to null (explicit null)', async () => {
    const existing = makeItemRow();
    const updated = makeItemRow({ quantity: null });
    mockDb.query.customGroceryItems.findFirst.mockResolvedValueOnce(existing);
    mockDb.select.mockReturnValueOnce(selFromWhere([updated]));

    const result = await updateCustomItem('item-1', { quantity: null });

    expect(result).not.toBeNull();
    expect(result!.quantity).toBeNull();
  });

  it('updates unit to null (explicit null)', async () => {
    const existing = makeItemRow();
    const updated = makeItemRow({ unit: null });
    mockDb.query.customGroceryItems.findFirst.mockResolvedValueOnce(existing);
    mockDb.select.mockReturnValueOnce(selFromWhere([updated]));

    const result = await updateCustomItem('item-1', { unit: null });

    expect(result).not.toBeNull();
    expect(result!.unit).toBeNull();
  });
});

// ===========================================================================
// deleteCustomItem
// ===========================================================================

describe('deleteCustomItem', () => {
  it('returns false when id not found', async () => {
    mockDb.query.customGroceryItems.findFirst.mockResolvedValueOnce(undefined);
    const result = await deleteCustomItem('nonexistent');
    expect(result).toBe(false);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('returns true and deletes on success', async () => {
    const existing = makeItemRow();
    mockDb.query.customGroceryItems.findFirst.mockResolvedValueOnce(existing);

    const result = await deleteCustomItem('item-1');

    expect(result).toBe(true);
    expect(mockDb.delete).toHaveBeenCalledOnce();
  });
});
