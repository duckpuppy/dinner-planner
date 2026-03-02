/**
 * Service unit tests for groceryChecks (mocked db).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Mock db before importing services
// ============================================================

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
  and: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    groceryChecks: {
      weekDate: null,
      itemKey: null,
      itemName: null,
      checkedByUserId: null,
      checkedAt: null,
    },
  },
}));

import { getCheckedKeys, toggleCheck, clearAllChecks } from '../services/groceryChecks.js';

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

function makeDelete() {
  return { where: vi.fn().mockResolvedValue(undefined) };
}

// --- Fixtures ---

function makeCheckRow(overrides: Record<string, unknown> = {}) {
  return {
    weekDate: '2026-02-24',
    itemKey: 'flour::cup',
    itemName: 'Flour',
    checkedByUserId: 'user-1',
    checkedAt: '2026-02-24T10:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.insert.mockReturnValue(makeInsert());
  mockDb.delete.mockReturnValue(makeDelete());
});

// ===========================================================================
// getCheckedKeys
// ===========================================================================

describe('getCheckedKeys', () => {
  it('returns empty array when no checks exist', async () => {
    mockDb.select.mockReturnValueOnce(selFrom([]));
    const result = await getCheckedKeys('2026-02-24');
    expect(result).toEqual([]);
  });

  it('returns array of itemKey strings', async () => {
    const row1 = makeCheckRow({ itemKey: 'flour::cup' });
    const row2 = makeCheckRow({ itemKey: 'eggs::' });
    mockDb.select.mockReturnValueOnce(selFrom([row1, row2]));

    const result = await getCheckedKeys('2026-02-24');
    expect(result).toEqual(['flour::cup', 'eggs::']);
  });

  it('returns only itemKey field (not full row)', async () => {
    const row = makeCheckRow();
    mockDb.select.mockReturnValueOnce(selFrom([row]));

    const result = await getCheckedKeys('2026-02-24');
    expect(result).toHaveLength(1);
    expect(typeof result[0]).toBe('string');
  });
});

// ===========================================================================
// toggleCheck
// ===========================================================================

describe('toggleCheck', () => {
  it('inserts and returns true when no existing row', async () => {
    // select returns empty (no existing check)
    mockDb.select.mockReturnValueOnce(selFrom([]));

    const result = await toggleCheck('2026-02-24', 'flour::cup', 'Flour', 'user-1');

    expect(result).toBe(true);
    expect(mockDb.insert).toHaveBeenCalledOnce();
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('deletes and returns false when row already exists', async () => {
    const existing = makeCheckRow();
    mockDb.select.mockReturnValueOnce(selFrom([existing]));

    const result = await toggleCheck('2026-02-24', 'flour::cup', 'Flour', 'user-1');

    expect(result).toBe(false);
    expect(mockDb.delete).toHaveBeenCalledOnce();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('inserts with correct values', async () => {
    mockDb.select.mockReturnValueOnce(selFrom([]));
    const insertValues = vi.fn().mockResolvedValue(undefined);
    mockDb.insert.mockReturnValueOnce({ values: insertValues });

    await toggleCheck('2026-02-24', 'flour::cup', 'Flour', 'user-42');

    expect(insertValues).toHaveBeenCalledWith({
      weekDate: '2026-02-24',
      itemKey: 'flour::cup',
      itemName: 'Flour',
      checkedByUserId: 'user-42',
    });
  });

  it('check-uncheck-check cycle works correctly', async () => {
    // First toggle: no existing → insert → returns true
    mockDb.select.mockReturnValueOnce(selFrom([]));
    const first = await toggleCheck('2026-02-24', 'eggs::', 'Eggs', 'user-1');
    expect(first).toBe(true);

    // Second toggle: existing → delete → returns false
    mockDb.select.mockReturnValueOnce(selFrom([makeCheckRow({ itemKey: 'eggs::' })]));
    const second = await toggleCheck('2026-02-24', 'eggs::', 'Eggs', 'user-1');
    expect(second).toBe(false);

    // Third toggle: no existing → insert → returns true
    mockDb.select.mockReturnValueOnce(selFrom([]));
    const third = await toggleCheck('2026-02-24', 'eggs::', 'Eggs', 'user-1');
    expect(third).toBe(true);
  });
});

// ===========================================================================
// clearAllChecks
// ===========================================================================

describe('clearAllChecks', () => {
  it('calls delete with the given weekDate', async () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    mockDb.delete.mockReturnValueOnce({ where: deleteFn });

    await clearAllChecks('2026-02-24');

    expect(mockDb.delete).toHaveBeenCalledOnce();
    expect(deleteFn).toHaveBeenCalledOnce();
  });

  it('resolves without error when no checks exist', async () => {
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    mockDb.delete.mockReturnValueOnce({ where: deleteFn });

    await expect(clearAllChecks('2026-02-24')).resolves.toBeUndefined();
  });

  it('resolves without error when checks exist', async () => {
    const deleteFn = vi.fn().mockResolvedValue({ rowsAffected: 3 });
    mockDb.delete.mockReturnValueOnce({ where: deleteFn });

    await expect(clearAllChecks('2026-01-01')).resolves.toBeUndefined();
  });
});
