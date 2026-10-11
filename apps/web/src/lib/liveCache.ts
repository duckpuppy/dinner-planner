import type { QueryClient } from '@tanstack/react-query';
import type { CustomGroceryItem, GroceryCheck, PantryItem, StandingItem } from './api';
import type { LiveEvent } from './liveEvents';
import { groceryFilters, mergeCheckRow, mergeClear, upsertById } from './offlineMutations';
import type { GroceriesData } from './pendingOps';

/**
 * Applies server-pushed events to the TanStack cache. Every merge is idempotent (replays and
 * echoes of our own writes are expected) and check state follows the same last-write-wins rule on
 * `updatedAt` as the server and the offline queue. Queued offline ops are not touched here: they
 * overlay the server data at render time (applyPendingOps) and still win when newer.
 */

export type LiveScope = 'grocery' | 'pantry';

/** Whether an event of this type is handled by a consumer mounted with the given scope. */
export function eventBelongsTo(scope: LiveScope, type: string): boolean {
  if (type === 'reset') return true;
  return type.startsWith(`${scope}.`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Payloads are the item itself; tolerate an `{ item }` wrapper. */
function itemOf<T extends { id: string }>(data: unknown): T | null {
  const body = isRecord(data) && isRecord(data.item) ? data.item : data;
  return isRecord(body) && typeof body.id === 'string' ? (body as unknown as T) : null;
}

function idOf(data: unknown): string | null {
  return isRecord(data) && typeof data.id === 'string' ? data.id : null;
}

function parseCheck(data: unknown): { weekDate: string; row: GroceryCheck } | null {
  if (!isRecord(data)) return null;
  const { weekDate, itemKey, checked, updatedAt, checkedBy } = data;
  if (
    typeof weekDate !== 'string' ||
    typeof itemKey !== 'string' ||
    typeof checked !== 'boolean' ||
    typeof updatedAt !== 'number'
  ) {
    return null;
  }
  const by =
    isRecord(checkedBy) &&
    typeof checkedBy.id === 'string' &&
    typeof checkedBy.displayName === 'string'
      ? { id: checkedBy.id, displayName: checkedBy.displayName }
      : null;
  return { weekDate, row: { itemKey, checked, updatedAt, checkedBy: by } };
}

function mergeCheck(d: GroceriesData, row: GroceryCheck): GroceriesData {
  const existing = d.checks?.find((c) => c.itemKey === row.itemKey);
  // Same or newer, same state: nothing to change (keeps echoes from re-rendering).
  if (existing && existing.updatedAt >= row.updatedAt && existing.checked === row.checked) return d;
  return mergeCheckRow(d, row);
}

function updateGroceries(
  qc: QueryClient,
  week: string | null,
  fn: (d: GroceriesData) => GroceriesData
) {
  qc.setQueriesData<GroceriesData>(groceryFilters(week), (d) => (d ? fn(d) : d));
}

function updatePantry(qc: QueryClient, fn: (items: PantryItem[]) => PantryItem[]) {
  qc.setQueryData<{ items: PantryItem[] }>(['pantry'], (d) =>
    d ? { ...d, items: fn(d.items) } : d
  );
}

/** Apply one event. Resolves once the cache is updated; unknown or malformed events are ignored. */
export async function applyLiveEvent(qc: QueryClient, event: LiveEvent): Promise<void> {
  const { type, data } = event;
  switch (type) {
    case 'grocery.check': {
      const parsed = parseCheck(data);
      if (!parsed) return;
      // A poll that started before this event would land afterwards with older data.
      await qc.cancelQueries(groceryFilters(parsed.weekDate));
      updateGroceries(qc, parsed.weekDate, (d) => mergeCheck(d, parsed.row));
      return;
    }
    case 'grocery.clear': {
      if (!isRecord(data) || typeof data.weekDate !== 'string' || typeof data.at !== 'number') {
        return;
      }
      const { weekDate, at } = data;
      await qc.cancelQueries(groceryFilters(weekDate));
      updateGroceries(qc, weekDate, (d) => mergeClear(d, at));
      return;
    }
    case 'grocery.custom.add':
    case 'grocery.custom.update': {
      const item = itemOf<CustomGroceryItem>(data);
      if (!item) return;
      updateGroceries(qc, item.weekDate ?? null, (d) => ({
        ...d,
        customItems: upsertById(d.customItems, item),
      }));
      return;
    }
    case 'grocery.custom.delete': {
      const id = idOf(data);
      if (!id) return;
      updateGroceries(qc, null, (d) =>
        d.customItems.some((i) => i.id === id)
          ? { ...d, customItems: d.customItems.filter((i) => i.id !== id) }
          : d
      );
      return;
    }
    case 'grocery.standing.add': {
      const item = itemOf<StandingItem>(data);
      if (!item) return;
      updateGroceries(qc, null, (d) => ({
        ...d,
        standingItems: upsertById(d.standingItems, item),
      }));
      return;
    }
    case 'grocery.standing.delete': {
      const id = idOf(data);
      if (!id) return;
      updateGroceries(qc, null, (d) =>
        d.standingItems.some((i) => i.id === id)
          ? { ...d, standingItems: d.standingItems.filter((i) => i.id !== id) }
          : d
      );
      return;
    }
    case 'pantry.add':
    case 'pantry.update': {
      const item = itemOf<PantryItem>(data);
      if (!item) return;
      updatePantry(qc, (items) => upsertById(items, item));
      // The grocery list flags items already in the pantry.
      void qc.invalidateQueries({ queryKey: ['groceries'] });
      return;
    }
    case 'pantry.delete': {
      const id = idOf(data);
      if (!id) return;
      updatePantry(qc, (items) =>
        items.some((i) => i.id === id) ? items.filter((i) => i.id !== id) : items
      );
      void qc.invalidateQueries({ queryKey: ['groceries'] });
      return;
    }
    case 'reset': {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['groceries'] }),
        qc.invalidateQueries({ queryKey: ['pantry'] }),
      ]);
      return;
    }
    default:
      return; // unknown event: ignore
  }
}
