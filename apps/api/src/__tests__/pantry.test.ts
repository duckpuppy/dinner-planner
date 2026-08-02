/**
 * Service unit tests for pantry (mocked db).
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
    pantryItems: { findFirst: vi.fn() },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
  and: vi.fn().mockReturnValue(null),
  asc: vi.fn().mockReturnValue(null),
  inArray: vi.fn().mockReturnValue(null),
  desc: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    pantryItems: {
      id: null,
      familyId: null,
      ingredientName: null,
      quantity: null,
      unit: null,
      expiresAt: null,
      createdAt: null,
    },
  },
}));

import {
  listPantryItems,
  createPantryItem,
  updatePantryItem,
  deletePantryItem,
} from '../services/pantry.js';

const FAMILY_ID = 'family-1';
const OTHER_FAMILY_ID = 'family-2';

// --- Chain helpers ---

function selFrom(result: unknown[]) {
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

function makePantryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pantry-1',
    familyId: FAMILY_ID,
    ingredientName: 'Olive Oil',
    quantity: 500,
    unit: 'ml',
    expiresAt: '2026-06-01',
    createdAt: '2026-02-23T00:00:00.000Z',
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
// listPantryItems
// ===========================================================================

describe('listPantryItems', () => {
  it('returns empty array when no items exist', async () => {
    mockDb.select.mockReturnValueOnce(selFrom([]));
    const result = await listPantryItems(FAMILY_ID);
    expect(result).toEqual([]);
  });

  it('returns items sorted by ingredientName', async () => {
    const row1 = makePantryRow({ id: 'pantry-1', ingredientName: 'Zucchini' });
    const row2 = makePantryRow({ id: 'pantry-2', ingredientName: 'Apple' });
    mockDb.select.mockReturnValueOnce(selFrom([row1, row2]));

    const result = await listPantryItems(FAMILY_ID);
    expect(result).toHaveLength(2);
    expect(result[0].ingredientName).toBe('Apple');
    expect(result[1].ingredientName).toBe('Zucchini');
  });

  it('maps all fields correctly', async () => {
    const row = makePantryRow();
    mockDb.select.mockReturnValueOnce(selFrom([row]));

    const [result] = await listPantryItems(FAMILY_ID);
    expect(result).toEqual({
      id: 'pantry-1',
      ingredientName: 'Olive Oil',
      quantity: 500,
      unit: 'ml',
      expiresAt: '2026-06-01',
      createdAt: '2026-02-23T00:00:00.000Z',
    });
  });

  it('maps null optional fields to null', async () => {
    const row = makePantryRow({ quantity: null, unit: null, expiresAt: null });
    mockDb.select.mockReturnValueOnce(selFrom([row]));

    const [result] = await listPantryItems(FAMILY_ID);
    expect(result.quantity).toBeNull();
    expect(result.unit).toBeNull();
    expect(result.expiresAt).toBeNull();
  });
});

// ===========================================================================
// createPantryItem
// ===========================================================================

describe('createPantryItem', () => {
  it('inserts into db and returns the new item', async () => {
    const row = makePantryRow();
    // First select: from().where() — used in createPantryItem after insert
    mockDb.select.mockReturnValueOnce(selFrom([row]));

    const result = await createPantryItem(
      {
        ingredientName: 'Olive Oil',
        quantity: 500,
        unit: 'ml',
        expiresAt: '2026-06-01',
      },
      FAMILY_ID
    );

    expect(mockDb.insert).toHaveBeenCalledOnce();
    expect(result.ingredientName).toBe('Olive Oil');
    expect(result.quantity).toBe(500);
  });

  it('handles optional fields being omitted', async () => {
    const row = makePantryRow({ quantity: null, unit: null, expiresAt: null });
    mockDb.select.mockReturnValueOnce(selFrom([row]));

    const result = await createPantryItem({ ingredientName: 'Olive Oil' }, FAMILY_ID);

    expect(result.quantity).toBeNull();
    expect(result.unit).toBeNull();
    expect(result.expiresAt).toBeNull();
  });
});

// ===========================================================================
// updatePantryItem
// ===========================================================================

describe('updatePantryItem', () => {
  it('returns null when id not found', async () => {
    mockDb.query.pantryItems.findFirst.mockResolvedValueOnce(undefined);
    const result = await updatePantryItem('nonexistent', { ingredientName: 'Garlic' }, FAMILY_ID);
    expect(result).toBeNull();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('returns null when item belongs to another family', async () => {
    // findFirst is scoped by (id, familyId) in the where clause -- from the
    // requesting family's perspective, a cross-family item simply isn't found.
    mockDb.query.pantryItems.findFirst.mockResolvedValueOnce(undefined);
    const result = await updatePantryItem('pantry-1', { ingredientName: 'Garlic' }, FAMILY_ID);
    expect(result).toBeNull();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('updates and returns the updated item', async () => {
    const existing = makePantryRow();
    const updated = makePantryRow({ ingredientName: 'Garlic', quantity: 3 });
    mockDb.query.pantryItems.findFirst.mockResolvedValueOnce(existing);
    mockDb.select.mockReturnValueOnce(selFrom([updated]));

    const result = await updatePantryItem(
      'pantry-1',
      { ingredientName: 'Garlic', quantity: 3 },
      FAMILY_ID
    );

    expect(mockDb.update).toHaveBeenCalledOnce();
    expect(result).not.toBeNull();
    expect(result!.ingredientName).toBe('Garlic');
    expect(result!.quantity).toBe(3);
  });
});

// ===========================================================================
// deletePantryItem
// ===========================================================================

describe('deletePantryItem', () => {
  it('returns { success: false } when id not found', async () => {
    mockDb.query.pantryItems.findFirst.mockResolvedValueOnce(undefined);
    const result = await deletePantryItem('nonexistent', FAMILY_ID);
    expect(result).toEqual({ success: false });
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('returns { success: false } when item belongs to another family (cross-family 404)', async () => {
    mockDb.query.pantryItems.findFirst.mockResolvedValueOnce(undefined);
    const result = await deletePantryItem('pantry-1', OTHER_FAMILY_ID);
    expect(result).toEqual({ success: false });
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('returns { success: true } and deletes on success', async () => {
    const existing = makePantryRow();
    mockDb.query.pantryItems.findFirst.mockResolvedValueOnce(existing);

    const result = await deletePantryItem('pantry-1', FAMILY_ID);

    expect(result).toEqual({ success: true });
    expect(mockDb.delete).toHaveBeenCalledOnce();
  });
});
