import { describe, it, expect, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { CustomGroceryItem, PantryItem, StandingItem } from './api';
import { applyLiveEvent, eventBelongsTo } from './liveCache';
import { applyPendingOps, type GroceriesData, type PendingOp } from './pendingOps';

const WEEK = '2024-06-10';
const KEY = ['groceries', WEEK] as const;
const ann = { id: 'u1', displayName: 'Ann Lee' };

function groceries(over: Partial<GroceriesData> = {}): GroceriesData {
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

const custom = (id: string, name = id): CustomGroceryItem => ({
  id,
  weekDate: WEEK,
  name,
  quantity: null,
  unit: null,
  sortOrder: 1,
  storeId: null,
  storeName: null,
});
const standing = (id: string, name = id): StandingItem => ({
  id,
  name,
  quantity: null,
  unit: null,
  category: 'Other',
  storeId: null,
  storeName: null,
});
const pantryItem = (id: string, name = id): PantryItem => ({
  id,
  ingredientName: name,
  quantity: null,
  unit: null,
  expiresAt: null,
  createdAt: '2024-06-01T00:00:00.000Z',
});

function check(itemKey: string, checked: boolean, updatedAt: number, by: typeof ann | null = ann) {
  return {
    type: 'grocery.check',
    data: { weekDate: WEEK, itemKey, checked, updatedAt, checkedBy: by },
  };
}

describe('applyLiveEvent', () => {
  let qc: QueryClient;
  const get = () => qc.getQueryData<GroceriesData>(KEY)!;

  beforeEach(() => {
    qc = new QueryClient();
    qc.setQueryData(KEY, groceries());
    qc.setQueryData(['pantry'], { items: [pantryItem('p1')] });
  });

  it('routes events to scopes', () => {
    expect(eventBelongsTo('grocery', 'grocery.check')).toBe(true);
    expect(eventBelongsTo('grocery', 'pantry.add')).toBe(false);
    expect(eventBelongsTo('pantry', 'pantry.add')).toBe(true);
    expect(eventBelongsTo('pantry', 'reset')).toBe(true);
    expect(eventBelongsTo('grocery', 'reset')).toBe(true);
  });

  describe('grocery.check', () => {
    it('merges a check with attribution', async () => {
      await applyLiveEvent(qc, check('milk::', true, 100));
      expect(get().checkedKeys).toEqual(['milk::']);
      expect(get().checks).toEqual([
        { itemKey: 'milk::', checked: true, updatedAt: 100, checkedBy: ann },
      ]);
    });

    it('does not let an older event overwrite a newer row', async () => {
      await applyLiveEvent(qc, check('milk::', true, 200));
      await applyLiveEvent(qc, check('milk::', false, 100, null));
      expect(get().checks![0]).toMatchObject({ checked: true, updatedAt: 200 });
    });

    it('a newer event wins', async () => {
      await applyLiveEvent(qc, check('milk::', true, 100));
      await applyLiveEvent(qc, check('milk::', false, 150, null));
      expect(get().checkedKeys).toEqual([]);
      expect(get().checks![0]).toMatchObject({ checked: false, updatedAt: 150 });
    });

    it('is idempotent and keeps the same data reference for an echo', async () => {
      await applyLiveEvent(qc, check('milk::', true, 100));
      const before = get();
      await applyLiveEvent(qc, check('milk::', true, 100));
      expect(get()).toBe(before);
    });

    it('only touches the matching week and ignores uncached weeks', async () => {
      qc.setQueryData(['groceries', '2024-06-17'], groceries({ weekStartDate: '2024-06-17' }));
      await applyLiveEvent(qc, check('milk::', true, 100));
      expect(qc.getQueryData<GroceriesData>(['groceries', '2024-06-17'])!.checks).toEqual([]);
      await applyLiveEvent(qc, {
        type: 'grocery.check',
        data: {
          weekDate: '1999-01-04',
          itemKey: 'x',
          checked: true,
          updatedAt: 1,
          checkedBy: null,
        },
      });
      expect(get().checks!.map((c) => c.itemKey)).toEqual(['milk::']);
    });

    it('ignores malformed payloads', async () => {
      await applyLiveEvent(qc, { type: 'grocery.check', data: { weekDate: WEEK } });
      await applyLiveEvent(qc, { type: 'grocery.check', data: undefined });
      expect(get().checks).toEqual([]);
    });

    it('drops an invalid checkedBy to null', async () => {
      await applyLiveEvent(qc, {
        type: 'grocery.check',
        data: { weekDate: WEEK, itemKey: 'a', checked: true, updatedAt: 5, checkedBy: { id: 1 } },
      });
      expect(get().checks![0].checkedBy).toBeNull();
    });

    it('queued offline ops that are newer than the event still win in the overlay', async () => {
      await applyLiveEvent(qc, check('milk::', true, 100));
      const ops: PendingOp[] = [
        {
          key: ['offline', 'grocery', 'check', 'set'],
          vars: {
            weekDate: WEEK,
            itemKey: 'milk::',
            itemName: 'milk',
            checked: false,
            clientUpdatedAt: 300,
          },
          submittedAt: 1,
        },
        {
          key: ['offline', 'grocery', 'check', 'set'],
          vars: {
            weekDate: WEEK,
            itemKey: 'eggs::',
            itemName: 'eggs',
            checked: true,
            clientUpdatedAt: 50,
          },
          submittedAt: 2,
        },
      ];
      await applyLiveEvent(qc, check('eggs::', false, 90, null));
      const view = applyPendingOps(get(), ops);
      expect(view.checkedKeys).not.toContain('milk::'); // our newer uncheck wins
      expect(view.checkedKeys).not.toContain('eggs::'); // the newer remote row beats our older op
    });
  });

  describe('grocery.clear', () => {
    it('unchecks entries older than `at` and keeps newer checks', async () => {
      await applyLiveEvent(qc, check('a::', true, 100));
      await applyLiveEvent(qc, check('b::', true, 500));
      await applyLiveEvent(qc, { type: 'grocery.clear', data: { weekDate: WEEK, at: 300 } });
      expect(get().checkedKeys).toEqual(['b::']);
      expect(get().checks!.find((c) => c.itemKey === 'a::')).toMatchObject({
        checked: false,
        updatedAt: 300,
      });
    });

    it('ignores malformed clears', async () => {
      await applyLiveEvent(qc, check('a::', true, 100));
      await applyLiveEvent(qc, { type: 'grocery.clear', data: { weekDate: WEEK } });
      expect(get().checkedKeys).toEqual(['a::']);
    });
  });

  describe('custom and standing items', () => {
    it('adds and updates custom items by id, idempotently', async () => {
      await applyLiveEvent(qc, { type: 'grocery.custom.add', data: custom('c1', 'Foil') });
      await applyLiveEvent(qc, { type: 'grocery.custom.add', data: custom('c1', 'Foil') });
      expect(get().customItems).toHaveLength(1);
      await applyLiveEvent(qc, { type: 'grocery.custom.update', data: custom('c1', 'Wrap') });
      expect(get().customItems.map((i) => i.name)).toEqual(['Wrap']);
      await applyLiveEvent(qc, { type: 'grocery.custom.update', data: custom('c2', 'Tape') });
      expect(get().customItems.map((i) => i.id)).toEqual(['c1', 'c2']);
    });

    it('deletes custom items, and a repeated delete is a no-op', async () => {
      await applyLiveEvent(qc, { type: 'grocery.custom.add', data: custom('c1') });
      await applyLiveEvent(qc, { type: 'grocery.custom.delete', data: { id: 'c1' } });
      const after = get();
      expect(after.customItems).toEqual([]);
      await applyLiveEvent(qc, { type: 'grocery.custom.delete', data: { id: 'c1' } });
      expect(get()).toBe(after);
    });

    it('adds and deletes standing items', async () => {
      await applyLiveEvent(qc, { type: 'grocery.standing.add', data: standing('s1') });
      await applyLiveEvent(qc, { type: 'grocery.standing.add', data: standing('s1') });
      expect(get().standingItems).toHaveLength(1);
      await applyLiveEvent(qc, { type: 'grocery.standing.delete', data: { id: 's1' } });
      expect(get().standingItems).toEqual([]);
      const after = get();
      await applyLiveEvent(qc, { type: 'grocery.standing.delete', data: { id: 's1' } });
      expect(get()).toBe(after);
    });

    it('accepts an { item } wrapper and ignores payloads without ids', async () => {
      await applyLiveEvent(qc, { type: 'grocery.custom.add', data: { item: custom('c9') } });
      expect(get().customItems.map((i) => i.id)).toEqual(['c9']);
      await applyLiveEvent(qc, { type: 'grocery.custom.add', data: { nope: 1 } });
      await applyLiveEvent(qc, { type: 'grocery.custom.delete', data: {} });
      await applyLiveEvent(qc, { type: 'grocery.standing.add', data: null });
      await applyLiveEvent(qc, { type: 'grocery.standing.delete', data: 'x' });
      expect(get().customItems).toHaveLength(1);
    });
  });

  describe('pantry', () => {
    const items = () => qc.getQueryData<{ items: PantryItem[] }>(['pantry'])!.items;

    it('adds, updates and deletes idempotently', async () => {
      await applyLiveEvent(qc, { type: 'pantry.add', data: pantryItem('p2', 'Rice') });
      await applyLiveEvent(qc, { type: 'pantry.add', data: pantryItem('p2', 'Rice') });
      expect(items().map((i) => i.id)).toEqual(['p1', 'p2']);
      await applyLiveEvent(qc, { type: 'pantry.update', data: pantryItem('p2', 'Brown rice') });
      expect(items()[1].ingredientName).toBe('Brown rice');
      await applyLiveEvent(qc, { type: 'pantry.delete', data: { id: 'p2' } });
      expect(items().map((i) => i.id)).toEqual(['p1']);
      const same = items();
      await applyLiveEvent(qc, { type: 'pantry.delete', data: { id: 'p2' } });
      expect(items()).toBe(same);
    });

    it('invalidates groceries (inPantry flags change)', async () => {
      await applyLiveEvent(qc, { type: 'pantry.add', data: pantryItem('p3') });
      expect(qc.getQueryState(KEY)!.isInvalidated).toBe(true);
    });

    it('leaves an uncached pantry alone and ignores malformed payloads', async () => {
      qc.removeQueries({ queryKey: ['pantry'] });
      await applyLiveEvent(qc, { type: 'pantry.add', data: pantryItem('p3') });
      expect(qc.getQueryData(['pantry'])).toBeUndefined();
      await applyLiveEvent(qc, { type: 'pantry.add', data: {} });
      await applyLiveEvent(qc, { type: 'pantry.delete', data: {} });
    });
  });

  it('reset invalidates groceries and pantry', async () => {
    await applyLiveEvent(qc, { type: 'reset', data: undefined });
    expect(qc.getQueryState(KEY)!.isInvalidated).toBe(true);
    expect(qc.getQueryState(['pantry'])!.isInvalidated).toBe(true);
  });

  it('ignores unknown events', async () => {
    const before = get();
    await applyLiveEvent(qc, { type: 'something.new', data: { a: 1 } });
    await applyLiveEvent(qc, { type: 'message', data: undefined });
    expect(get()).toBe(before);
    expect(qc.getQueryState(KEY)!.isInvalidated).toBe(false);
  });

  it('converges: two clients fed the same events in any order end identical', async () => {
    const other = new QueryClient();
    other.setQueryData(KEY, groceries());
    const events = [
      check('a::', true, 100),
      check('b::', true, 200),
      check('a::', false, 150, null),
      { type: 'grocery.clear', data: { weekDate: WEEK, at: 120 } },
      { type: 'grocery.custom.add', data: custom('c1') },
      { type: 'grocery.custom.delete', data: { id: 'c1' } },
    ];
    for (const e of events) await applyLiveEvent(qc, e);
    for (const e of [...events].reverse()) await applyLiveEvent(other, e);
    // custom add/delete reverse-order differs by design (delete then add resurrects), so compare checks
    const norm = (d: GroceriesData) =>
      [...(d.checks ?? [])].sort((x, y) => x.itemKey.localeCompare(y.itemKey));
    expect(
      norm(other.getQueryData<GroceriesData>(KEY)!).map((c) => [c.itemKey, c.checked])
    ).toEqual(norm(get()).map((c) => [c.itemKey, c.checked]));
    expect(get().checkedKeys.sort()).toEqual(
      other.getQueryData<GroceriesData>(KEY)!.checkedKeys.sort()
    );
  });

  it('converges: two clients fed the same ordered events end identical', async () => {
    const other = new QueryClient();
    other.setQueryData(KEY, groceries());
    const events = [
      check('a::', true, 100),
      check('b::', true, 200),
      { type: 'grocery.standing.add', data: standing('s1') },
      { type: 'grocery.clear', data: { weekDate: WEEK, at: 150 } },
    ];
    for (const e of events) {
      await applyLiveEvent(qc, e);
      await applyLiveEvent(other, e);
    }
    expect(other.getQueryData(KEY)).toEqual(get());
  });
});
