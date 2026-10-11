import type { Query } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ApiError,
  NetworkError,
  menus,
  pantry as pantryApi,
  standing as standingApi,
  type CustomGroceryItem,
  type GroceryCheck,
  type PantryItem,
  type StandingItem,
} from './api';
import { recordFailed } from './failedSyncStore';
import { queryClient } from './queryClient';
import type { GroceriesData } from './pendingOps';

/**
 * Offline-capable writes for grocery and pantry. Importing this module registers the mutation
 * defaults (mutationFn, retry policy, cache merge) for every ['offline', ...] key. That MUST
 * happen before the persisted queue is hydrated, because functions don't serialize: hydrate()
 * only restores {mutationKey, variables, scope}.
 *
 * All offline mutations share the scope 'offline-sync' so they replay serially, in FIFO order.
 * While the app is offline (onlineManager) they stay paused; the UI renders them through the
 * overlay in pendingOps.ts rather than by editing the query cache optimistically.
 */

export const OFFLINE_SCOPE = { id: 'offline-sync' } as const;

export interface OfflineVars {
  checkSet: {
    weekDate: string;
    itemKey: string;
    itemName: string;
    checked: boolean;
    clientUpdatedAt: number;
  };
  checkClear: { weekDate: string; clientUpdatedAt: number };
  customAdd: {
    id: string;
    weekDate: string;
    name: string;
    quantity?: number;
    unit?: string;
    storeId?: string;
    /** Display only (for the pending row); never sent to the server. */
    storeName?: string | null;
  };
  customDelete: { id: string };
  standingAdd: {
    id: string;
    name: string;
    quantity?: number;
    unit?: string;
    category?: string;
    storeId?: string;
    /** Display only (for the pending row); never sent to the server. */
    storeName?: string | null;
  };
  standingDelete: { id: string };
  pantryAdd: {
    id: string;
    ingredientName: string;
    quantity?: number | null;
    unit?: string | null;
    expiresAt?: string | null;
  };
  pantryDelete: { id: string };
}

export type OfflineOp = keyof OfflineVars;

export const OFFLINE_KEYS: { [K in OfflineOp]: readonly string[] } = {
  checkSet: ['offline', 'grocery', 'check', 'set'],
  checkClear: ['offline', 'grocery', 'check', 'clear'],
  customAdd: ['offline', 'grocery', 'custom', 'add'],
  customDelete: ['offline', 'grocery', 'custom', 'delete'],
  standingAdd: ['offline', 'grocery', 'standing', 'add'],
  standingDelete: ['offline', 'grocery', 'standing', 'delete'],
  pantryAdd: ['offline', 'pantry', 'add'],
  pantryDelete: ['offline', 'pantry', 'delete'],
};

// ---------------------------------------------------------------------------
// ids and clocks
// ---------------------------------------------------------------------------

/**
 * RFC 4122 v4 id for client-generated creates. crypto.randomUUID only exists in secure contexts
 * (not on plain-http LAN access), so fall back to getRandomValues, then Math.random.
 */
export function newClientId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

let lastStamp = 0;
/** Strictly increasing epoch ms, so two quick writes always order the way the user made them. */
export function nextClientTimestamp(): number {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}

// ---------------------------------------------------------------------------
// retry policy
// ---------------------------------------------------------------------------

const MAX_SERVER_RETRIES = 3;
const MAX_RETRY_DELAY_MS = 30_000;

/** Network trouble retries forever, 5xx/429 up to 3 times, any other 4xx never. */
export function offlineRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  if (error instanceof ApiError) {
    if (error.status >= 500 || error.status === 429) return failureCount < MAX_SERVER_RETRIES;
    return false;
  }
  return false;
}

/** Exponential backoff with jitter (50-100% of the step), capped at 30s. */
export function offlineRetryDelay(failureCount: number): number {
  const step = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** failureCount);
  return Math.round(step / 2 + (Math.random() * step) / 2);
}

// ---------------------------------------------------------------------------
// cache merge helpers
// ---------------------------------------------------------------------------

export function groceryFilters(week: string | null) {
  return week === null
    ? { queryKey: ['groceries'] as const }
    : {
        queryKey: ['groceries'] as const,
        predicate: (q: Query) =>
          q.queryKey[1] === week ||
          (q.state.data as GroceriesData | undefined)?.weekStartDate === week,
      };
}

function updateGroceries(week: string | null, fn: (d: GroceriesData) => GroceriesData) {
  queryClient.setQueriesData<GroceriesData>(groceryFilters(week), (d) => (d ? fn(d) : d));
}

function checkMap(d: GroceriesData): Map<string, GroceryCheck> {
  const m = new Map<string, GroceryCheck>();
  for (const k of d.checkedKeys ?? []) {
    m.set(k, { itemKey: k, checked: true, updatedAt: 0, checkedBy: null });
  }
  for (const c of d.checks ?? []) m.set(c.itemKey, c);
  return m;
}

function withChecks(d: GroceriesData, m: Map<string, GroceryCheck>): GroceriesData {
  const checks = [...m.values()];
  return { ...d, checks, checkedKeys: checks.filter((c) => c.checked).map((c) => c.itemKey) };
}

export function mergeCheckRow(d: GroceriesData, row: GroceryCheck): GroceriesData {
  const m = checkMap(d);
  const existing = m.get(row.itemKey);
  if (existing && existing.updatedAt > row.updatedAt) return d;
  m.set(row.itemKey, row);
  return withChecks(d, m);
}

export function mergeClear(d: GroceriesData, clientUpdatedAt: number): GroceriesData {
  const m = checkMap(d);
  for (const [k, c] of m) {
    if (c.checked && c.updatedAt < clientUpdatedAt) {
      m.set(k, { ...c, checked: false, updatedAt: clientUpdatedAt });
    }
  }
  return withChecks(d, m);
}

export function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((i) => i.id === item.id)
    ? list.map((i) => (i.id === item.id ? item : i))
    : [...list, item];
}

// What to refetch once the queue drains. Pantry changes also change groceries (inPantry).
const dirty = { groceries: false, pantry: false };

function flushInvalidations() {
  const { groceries, pantry } = dirty;
  dirty.groceries = false;
  dirty.pantry = false;
  if (pantry) void queryClient.invalidateQueries({ queryKey: ['pantry'] });
  if (groceries || pantry) void queryClient.invalidateQueries({ queryKey: ['groceries'] });
}

// ---------------------------------------------------------------------------
// registration
// ---------------------------------------------------------------------------

function register<K extends OfflineOp, TData>(
  op: K,
  config: {
    mutationFn: (vars: OfflineVars[K]) => Promise<TData>;
    /** Domain refetched when the queue drains. */
    domain: 'groceries' | 'pantry';
    /** Cancel in-flight refetches that could overwrite the merge (null: every week). */
    affectedWeek?: (vars: OfflineVars[K]) => string | null;
    merge: (data: TData, vars: OfflineVars[K]) => void;
  }
) {
  const key = OFFLINE_KEYS[op];
  queryClient.setMutationDefaults(key, {
    mutationFn: config.mutationFn as (vars: unknown) => Promise<unknown>,
    networkMode: 'online',
    scope: OFFLINE_SCOPE,
    retry: offlineRetry,
    retryDelay: offlineRetryDelay,
    onSuccess: async (data, vars) => {
      const v = vars as OfflineVars[K];
      dirty[config.domain] = true;
      if (config.domain === 'groceries') {
        await queryClient.cancelQueries(groceryFilters(config.affectedWeek?.(v) ?? null));
      } else {
        await queryClient.cancelQueries({ queryKey: ['pantry'] });
      }
      config.merge(data as TData, v);
    },
    onError: (error, vars) => {
      const message = error instanceof Error ? error.message : 'Unknown error';
      recordFailed({ key, vars, message });
      toast.error(`A change couldn't be saved: ${message}`);
    },
    onSettled: () => {
      // Still counted as pending while this callback runs, so 1 means "last in the queue".
      if (queryClient.isMutating({ mutationKey: ['offline'] }) === 1) flushInvalidations();
    },
  });
}

register('checkSet', {
  domain: 'groceries',
  mutationFn: (v) => menus.setGroceryCheck(v),
  affectedWeek: (v) => v.weekDate,
  merge: (row, v) =>
    updateGroceries(v.weekDate, (d) =>
      mergeCheckRow(d, {
        itemKey: row.itemKey,
        checked: row.checked,
        updatedAt: row.updatedAt,
        checkedBy: row.checkedBy,
      })
    ),
});

register('checkClear', {
  domain: 'groceries',
  mutationFn: (v) => menus.clearGroceryChecks(v),
  affectedWeek: (v) => v.weekDate,
  merge: (_res, v) => updateGroceries(v.weekDate, (d) => mergeClear(d, v.clientUpdatedAt)),
});

register('customAdd', {
  domain: 'groceries',
  mutationFn: (v) =>
    menus.addCustomItem(v.weekDate, {
      id: v.id,
      name: v.name,
      ...(v.quantity !== undefined ? { quantity: v.quantity } : {}),
      ...(v.unit !== undefined ? { unit: v.unit } : {}),
      ...(v.storeId !== undefined ? { storeId: v.storeId } : {}),
    }),
  affectedWeek: (v) => v.weekDate,
  merge: (item: CustomGroceryItem, v) =>
    updateGroceries(v.weekDate, (d) => ({ ...d, customItems: upsertById(d.customItems, item) })),
});

register('customDelete', {
  domain: 'groceries',
  mutationFn: (v) => menus.deleteCustomItem(v.id),
  merge: (_res, v) =>
    updateGroceries(null, (d) => ({
      ...d,
      customItems: d.customItems.filter((i) => i.id !== v.id),
    })),
});

register('standingAdd', {
  domain: 'groceries',
  mutationFn: (v) =>
    standingApi.add({
      id: v.id,
      name: v.name,
      ...(v.quantity !== undefined ? { quantity: v.quantity } : {}),
      ...(v.unit !== undefined ? { unit: v.unit } : {}),
      ...(v.category !== undefined ? { category: v.category } : {}),
      ...(v.storeId !== undefined ? { storeId: v.storeId } : {}),
    }),
  merge: (item: StandingItem) =>
    updateGroceries(null, (d) => ({ ...d, standingItems: upsertById(d.standingItems, item) })),
});

register('standingDelete', {
  domain: 'groceries',
  mutationFn: (v) => standingApi.delete(v.id),
  merge: (_res, v) =>
    updateGroceries(null, (d) => ({
      ...d,
      standingItems: d.standingItems.filter((i) => i.id !== v.id),
    })),
});

register('pantryAdd', {
  domain: 'pantry',
  mutationFn: (v) =>
    pantryApi
      .create({
        id: v.id,
        ingredientName: v.ingredientName,
        quantity: v.quantity ?? null,
        unit: v.unit ?? null,
        expiresAt: v.expiresAt ?? null,
      })
      .then((res) => res.item),
  merge: (item: PantryItem) =>
    queryClient.setQueryData<{ items: PantryItem[] }>(['pantry'], (d) =>
      d ? { ...d, items: upsertById(d.items, item) } : d
    ),
});

register('pantryDelete', {
  domain: 'pantry',
  mutationFn: (v) => pantryApi.delete(v.id),
  merge: (_res, v) =>
    queryClient.setQueryData<{ items: PantryItem[] }>(['pantry'], (d) =>
      d ? { ...d, items: d.items.filter((i) => i.id !== v.id) } : d
    ),
});

// ---------------------------------------------------------------------------
// enqueue
// ---------------------------------------------------------------------------

/**
 * Enqueue a mutation by its key (used for retrying failed entries). The mutation lives in the
 * mutation cache, independent of any component, so closing a dialog doesn't cancel it.
 */
export function enqueueByKey(key: readonly unknown[], vars: unknown): Promise<unknown> {
  const mutation = queryClient.getMutationCache().build(queryClient, { mutationKey: key });
  // Failures are surfaced through the failed store and a toast, not the caller.
  return mutation.execute(vars).catch(() => undefined);
}

export function enqueue<K extends OfflineOp>(op: K, vars: OfflineVars[K]): Promise<unknown> {
  return enqueueByKey(OFFLINE_KEYS[op], vars);
}
