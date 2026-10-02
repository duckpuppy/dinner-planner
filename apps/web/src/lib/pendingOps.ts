import type { CustomGroceryItem, GroceryCheck, GroceryItem, PantryItem, StandingItem } from './api';

/**
 * Pure overlay of queued (not yet synced) offline operations on top of server data.
 * The UI renders from these functions so a pending change shows immediately and keeps
 * showing through refetches and app restarts (the queue is persisted, the cache is not
 * mutated optimistically).
 */

export interface PendingOp {
  key: readonly unknown[];
  vars: unknown;
  submittedAt: number;
}

export interface GroceriesData {
  groceries: GroceryItem[];
  customItems: CustomGroceryItem[];
  standingItems: StandingItem[];
  weekStartDate: string;
  checkedKeys: string[];
  checks?: GroceryCheck[];
}

export type Pending<T> = T & { pending?: boolean };

export interface OverlaidGroceries {
  groceries: GroceryItem[];
  customItems: Pending<CustomGroceryItem>[];
  standingItems: Pending<StandingItem>[];
  weekStartDate: string;
  checkedKeys: string[];
  /** Item keys whose checked state is affected by a not-yet-synced change. */
  pendingKeys: Set<string>;
}

/** 'grocery.check.set' for ['offline','grocery','check','set']. */
export function opName(key: readonly unknown[]): string {
  return key.slice(1).join('.');
}

interface CheckState {
  checked: boolean;
  updatedAt: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function applyPendingOps(server: GroceriesData, ops: PendingOp[]): OverlaidGroceries {
  const week = server.weekStartDate;

  // Per-item last-write-wins state, seeded from the server. `checks` is absent in data cached
  // before the server sent it; checkedKeys then count as written at time 0.
  const state = new Map<string, CheckState>();
  for (const k of server.checkedKeys ?? []) state.set(k, { checked: true, updatedAt: 0 });
  for (const c of server.checks ?? []) {
    state.set(c.itemKey, { checked: c.checked, updatedAt: c.updatedAt });
  }

  const pendingKeys = new Set<string>();
  let customItems: Pending<CustomGroceryItem>[] = (server.customItems ?? []).map((i) => ({ ...i }));
  let standingItems: Pending<StandingItem>[] = (server.standingItems ?? []).map((i) => ({ ...i }));

  // Ops apply in FIFO order (the order the mutation cache holds them).
  for (const op of ops) {
    const v = op.vars;
    if (!isRecord(v)) continue;
    switch (opName(op.key)) {
      case 'grocery.check.set': {
        if (v.weekDate !== week) break;
        const itemKey = v.itemKey as string;
        const t = v.clientUpdatedAt as number;
        const current = state.get(itemKey);
        // Missing server row means older. A newer write from another shopper wins.
        if (t > (current?.updatedAt ?? -1)) {
          state.set(itemKey, { checked: v.checked as boolean, updatedAt: t });
        }
        pendingKeys.add(itemKey);
        break;
      }
      case 'grocery.check.clear': {
        if (v.weekDate !== week) break;
        const t = v.clientUpdatedAt as number;
        for (const [k, s] of state) {
          if (s.checked && s.updatedAt < t) {
            state.set(k, { checked: false, updatedAt: t });
            pendingKeys.add(k);
          }
        }
        break;
      }
      case 'grocery.custom.add': {
        if (v.weekDate !== week) break;
        const id = v.id as string;
        if (customItems.some((i) => i.id === id)) break;
        customItems = [
          ...customItems,
          {
            id,
            weekDate: week,
            name: v.name as string,
            quantity: (v.quantity as number | undefined) ?? null,
            unit: (v.unit as string | undefined) ?? null,
            sortOrder: customItems.reduce((m, i) => Math.max(m, i.sortOrder), 0) + 1,
            storeId: (v.storeId as string | undefined) ?? null,
            storeName: (v.storeName as string | undefined) ?? null,
            pending: true,
          },
        ];
        break;
      }
      case 'grocery.custom.delete':
        customItems = customItems.filter((i) => i.id !== v.id);
        break;
      case 'grocery.standing.add': {
        const id = v.id as string;
        if (standingItems.some((i) => i.id === id)) break;
        standingItems = [
          ...standingItems,
          {
            id,
            name: v.name as string,
            quantity: (v.quantity as number | undefined) ?? null,
            unit: (v.unit as string | undefined) ?? null,
            category: (v.category as string | undefined) ?? 'Other',
            storeId: (v.storeId as string | undefined) ?? null,
            storeName: (v.storeName as string | undefined) ?? null,
            pending: true,
          },
        ];
        break;
      }
      case 'grocery.standing.delete':
        standingItems = standingItems.filter((i) => i.id !== v.id);
        break;
      default:
        break;
    }
  }

  const checkedKeys: string[] = [];
  for (const [k, s] of state) if (s.checked) checkedKeys.push(k);

  return {
    groceries: server.groceries,
    customItems,
    standingItems,
    weekStartDate: week,
    checkedKeys,
    pendingKeys,
  };
}

export function applyPendingPantry(items: PantryItem[], ops: PendingOp[]): Pending<PantryItem>[] {
  let result: Pending<PantryItem>[] = items.map((i) => ({ ...i }));
  for (const op of ops) {
    const v = op.vars;
    if (!isRecord(v)) continue;
    switch (opName(op.key)) {
      case 'pantry.add': {
        const id = v.id as string;
        if (result.some((i) => i.id === id)) break;
        result = [
          ...result,
          {
            id,
            ingredientName: v.ingredientName as string,
            quantity: (v.quantity as number | null | undefined) ?? null,
            unit: (v.unit as string | null | undefined) ?? null,
            expiresAt: (v.expiresAt as string | null | undefined) ?? null,
            createdAt: new Date(op.submittedAt).toISOString(),
            pending: true,
          },
        ];
        break;
      }
      case 'pantry.delete':
        result = result.filter((i) => i.id !== v.id);
        break;
      default:
        break;
    }
  }
  return result;
}
