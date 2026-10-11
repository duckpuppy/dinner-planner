import { describe, it, expect } from 'vitest';
import {
  applyPendingOps,
  applyPendingPantry,
  opName,
  type GroceriesData,
  type PendingOp,
} from './pendingOps';

const WEEK = '2024-06-10';

function server(over: Partial<GroceriesData> = {}): GroceriesData {
  return {
    groceries: [],
    customItems: [],
    standingItems: [],
    weekStartDate: WEEK,
    checkedKeys: [],
    checks: [],
    ...over,
  };
}

const KEYS = {
  set: ['offline', 'grocery', 'check', 'set'],
  clear: ['offline', 'grocery', 'check', 'clear'],
  customAdd: ['offline', 'grocery', 'custom', 'add'],
  customDelete: ['offline', 'grocery', 'custom', 'delete'],
  standingAdd: ['offline', 'grocery', 'standing', 'add'],
  standingDelete: ['offline', 'grocery', 'standing', 'delete'],
  pantryAdd: ['offline', 'pantry', 'add'],
  pantryDelete: ['offline', 'pantry', 'delete'],
};

let n = 0;
function op(key: readonly string[], vars: unknown): PendingOp {
  return { key, vars, submittedAt: 1_000 + n++ };
}

function setOp(itemKey: string, checked: boolean, clientUpdatedAt: number, weekDate = WEEK) {
  return op(KEYS.set, { weekDate, itemKey, itemName: itemKey, checked, clientUpdatedAt });
}

describe('opName', () => {
  it('drops the offline prefix', () => {
    expect(opName(KEYS.set)).toBe('grocery.check.set');
    expect(opName(KEYS.pantryAdd)).toBe('pantry.add');
  });
});

describe('applyPendingOps: checks', () => {
  it('applies a pending check immediately and marks the key pending', () => {
    const out = applyPendingOps(server(), [setOp('flour::g', true, 100)]);
    expect(out.checkedKeys).toEqual(['flour::g']);
    expect(out.pendingKeys.has('flour::g')).toBe(true);
  });

  it('an op beats a missing server row', () => {
    const out = applyPendingOps(server({ checks: [] }), [setOp('a', true, 1)]);
    expect(out.checkedKeys).toEqual(['a']);
  });

  it('an older pending check loses to a newer server write (last write wins)', () => {
    const data = server({
      checkedKeys: [],
      checks: [{ itemKey: 'a', checked: false, updatedAt: 500, checkedBy: null }],
    });
    // Another shopper unchecked at 500; our check was made at 400 while offline.
    const out = applyPendingOps(data, [setOp('a', true, 400)]);
    expect(out.checkedKeys).toEqual([]);
  });

  it('a newer pending check beats an older server write', () => {
    const data = server({
      checkedKeys: ['a'],
      checks: [{ itemKey: 'a', checked: true, updatedAt: 500, checkedBy: null }],
    });
    const out = applyPendingOps(data, [setOp('a', false, 600)]);
    expect(out.checkedKeys).toEqual([]);
  });

  it('later queued ops on the same key win over earlier ones (FIFO)', () => {
    const out = applyPendingOps(server(), [setOp('a', true, 10), setOp('a', false, 20)]);
    expect(out.checkedKeys).toEqual([]);
  });

  it('ignores ops for another week', () => {
    const out = applyPendingOps(server(), [setOp('a', true, 10, '2024-06-17')]);
    expect(out.checkedKeys).toEqual([]);
    expect(out.pendingKeys.size).toBe(0);
  });

  it('works with legacy data that has checkedKeys but no checks', () => {
    const out = applyPendingOps(server({ checkedKeys: ['a'], checks: undefined }), [
      setOp('a', false, 5),
    ]);
    expect(out.checkedKeys).toEqual([]);
  });
});

describe('applyPendingOps: clear', () => {
  it('unchecks everything older than the clear', () => {
    const data = server({
      checkedKeys: ['a', 'b'],
      checks: [
        { itemKey: 'a', checked: true, updatedAt: 100, checkedBy: null },
        { itemKey: 'b', checked: true, updatedAt: 200, checkedBy: null },
      ],
    });
    const out = applyPendingOps(data, [op(KEYS.clear, { weekDate: WEEK, clientUpdatedAt: 300 })]);
    expect(out.checkedKeys).toEqual([]);
    expect([...out.pendingKeys].sort()).toEqual(['a', 'b']);
  });

  it('a check made by someone else after the clear survives it', () => {
    const data = server({
      checkedKeys: ['a', 'late'],
      checks: [
        { itemKey: 'a', checked: true, updatedAt: 100, checkedBy: null },
        { itemKey: 'late', checked: true, updatedAt: 900, checkedBy: null },
      ],
    });
    const out = applyPendingOps(data, [op(KEYS.clear, { weekDate: WEEK, clientUpdatedAt: 500 })]);
    expect(out.checkedKeys).toEqual(['late']);
  });

  it('a queued check made before the clear is cleared by it, one made after is kept', () => {
    const out = applyPendingOps(server(), [
      setOp('before', true, 10),
      op(KEYS.clear, { weekDate: WEEK, clientUpdatedAt: 20 }),
      setOp('after', true, 30),
    ]);
    expect(out.checkedKeys).toEqual(['after']);
  });
});

describe('applyPendingOps: custom and standing items', () => {
  const custom = {
    id: 'c1',
    weekDate: WEEK,
    name: 'Paper towels',
    quantity: 2,
    unit: 'rolls',
    storeId: 's1',
    storeName: 'Costco',
  };

  it('inserts a pending custom item marked pending', () => {
    const out = applyPendingOps(server(), [op(KEYS.customAdd, custom)]);
    expect(out.customItems).toHaveLength(1);
    expect(out.customItems[0]).toMatchObject({
      id: 'c1',
      name: 'Paper towels',
      quantity: 2,
      storeName: 'Costco',
      pending: true,
    });
  });

  it('does not duplicate an item the server already has', () => {
    const existing = {
      id: 'c1',
      weekDate: WEEK,
      name: 'Paper towels',
      quantity: 2,
      unit: 'rolls',
      sortOrder: 0,
      storeId: 's1',
      storeName: 'Costco',
    };
    const out = applyPendingOps(server({ customItems: [existing] }), [op(KEYS.customAdd, custom)]);
    expect(out.customItems).toHaveLength(1);
    expect(out.customItems[0].pending).toBeUndefined();
  });

  it('add then delete of the same id leaves nothing', () => {
    const out = applyPendingOps(server(), [
      op(KEYS.customAdd, custom),
      op(KEYS.customDelete, { id: 'c1' }),
    ]);
    expect(out.customItems).toEqual([]);
  });

  it('a delete op hides a server item', () => {
    const existing = {
      id: 'c9',
      weekDate: WEEK,
      name: 'Soap',
      quantity: null,
      unit: null,
      sortOrder: 0,
      storeId: null,
      storeName: null,
    };
    const out = applyPendingOps(server({ customItems: [existing] }), [
      op(KEYS.customDelete, { id: 'c9' }),
    ]);
    expect(out.customItems).toEqual([]);
  });

  it('skips custom adds for another week', () => {
    const out = applyPendingOps(server(), [
      op(KEYS.customAdd, { ...custom, weekDate: '2024-06-17' }),
    ]);
    expect(out.customItems).toEqual([]);
  });

  it('adds and deletes standing items (not week scoped)', () => {
    const add = op(KEYS.standingAdd, { id: 'st1', name: 'Eggs', quantity: 12 });
    const out = applyPendingOps(server(), [add]);
    expect(out.standingItems[0]).toMatchObject({
      id: 'st1',
      name: 'Eggs',
      category: 'Other',
      pending: true,
    });
    const gone = applyPendingOps(server(), [add, op(KEYS.standingDelete, { id: 'st1' })]);
    expect(gone.standingItems).toEqual([]);
  });

  it('tolerates data cached without lists and ops with malformed variables', () => {
    const odd = { weekStartDate: WEEK, groceries: [] } as unknown as GroceriesData;
    const out = applyPendingOps(odd, [op(KEYS.set, null), op(['offline', 'unknown'], {})]);
    expect(out.checkedKeys).toEqual([]);
    expect(out.customItems).toEqual([]);
  });
});

describe('applyPendingPantry', () => {
  const item = {
    id: 'p1',
    ingredientName: 'Olive oil',
    quantity: 1,
    unit: 'L',
    expiresAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
  };

  it('inserts pending adds and hides deleted items', () => {
    const out = applyPendingPantry(
      [item],
      [
        op(KEYS.pantryAdd, { id: 'p2', ingredientName: 'Salt' }),
        op(KEYS.pantryDelete, { id: 'p1' }),
      ]
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 'p2',
      ingredientName: 'Salt',
      quantity: null,
      pending: true,
    });
  });

  it('does not duplicate an already-synced add', () => {
    const out = applyPendingPantry([item], [op(KEYS.pantryAdd, { id: 'p1', ingredientName: 'x' })]);
    expect(out).toHaveLength(1);
    expect(out[0].ingredientName).toBe('Olive oil');
  });

  it('ignores unrelated or malformed ops', () => {
    const out = applyPendingPantry([item], [op(KEYS.set, {}), op(KEYS.pantryAdd, 5)]);
    expect(out).toHaveLength(1);
  });
});
