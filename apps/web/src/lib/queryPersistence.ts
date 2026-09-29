import { del, get, set } from 'idb-keyval';
import { CACHE_MAX_AGE, queryClient } from './queryClient';

export const CACHE_KEY = 'dinner-planner-query-cache';

// TODO(dinner-1hs): switch to `__APP_VERSION__` once a build-identifying version lands.
// Bump this manually whenever the shape of cached query data changes.
export const CACHE_VERSION = '1';

const SAVE_DEBOUNCE_MS = 1000;

export interface CacheOwner {
  userId: string;
  familyId: string;
}

interface PersistedEntry {
  data: unknown;
  updatedAt: number;
}

interface PersistedCache {
  cacheVersion: string;
  userId: string;
  familyId: string;
  timestamp: number;
  entries: Record<string, PersistedEntry>;
}

let currentOwner: CacheOwner | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let unsubscribe: (() => void) | undefined;
// Incremented on every owner transition so late async work can detect it is stale.
let generation = 0;

function sameOwner(a: CacheOwner, b: CacheOwner) {
  return a.userId === b.userId && a.familyId === b.familyId;
}

async function deletePersisted() {
  try {
    await del(CACHE_KEY);
  } catch {
    // Ignore
  }
}

function stopPersisting() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  unsubscribe?.();
  unsubscribe = undefined;
}

async function save(owner: CacheOwner, gen: number) {
  const entries: Record<string, PersistedEntry> = {};
  for (const query of queryClient.getQueryCache().getAll()) {
    if (query.state.status === 'success' && query.state.data !== undefined) {
      entries[JSON.stringify(query.queryKey)] = {
        data: query.state.data,
        updatedAt: query.state.dataUpdatedAt,
      };
    }
  }
  if (gen !== generation) return;
  const payload: PersistedCache = {
    cacheVersion: CACHE_VERSION,
    userId: owner.userId,
    familyId: owner.familyId,
    timestamp: Date.now(),
    entries,
  };
  try {
    await set(CACHE_KEY, payload);
  } catch {
    // Ignore persistence errors
  }
}

function startPersisting(owner: CacheOwner, gen: number) {
  stopPersisting();
  unsubscribe = queryClient.getQueryCache().subscribe(() => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (gen === generation) void save(owner, gen);
    }, SAVE_DEBOUNCE_MS);
  });
}

/**
 * Bind the persisted cache to the authenticated user. Must be awaited after auth
 * resolves and BEFORE the authenticated UI renders, so nothing from a previous owner
 * is ever shown. Restores the persisted cache only when version, age, userId and
 * familyId all match; otherwise the persisted cache is deleted.
 */
export async function bindCacheOwner(owner: CacheOwner): Promise<void> {
  if (currentOwner && sameOwner(currentOwner, owner)) return;

  const previousOwner = currentOwner;
  const gen = ++generation;
  stopPersisting();
  currentOwner = owner;

  if (previousOwner) {
    // In-session owner change (e.g. moved to a new family): drop everything and
    // refetch whatever is mounted.
    void queryClient.resetQueries();
    await deletePersisted();
    if (gen === generation) startPersisting(owner, gen);
    return;
  }

  let stored: PersistedCache | undefined;
  try {
    stored = await get<PersistedCache>(CACHE_KEY);
  } catch {
    stored = undefined;
  }
  if (gen !== generation) return;

  if (stored) {
    const valid =
      stored.cacheVersion === CACHE_VERSION &&
      stored.userId === owner.userId &&
      stored.familyId === owner.familyId &&
      typeof stored.timestamp === 'number' &&
      Date.now() - stored.timestamp <= CACHE_MAX_AGE &&
      typeof stored.entries === 'object' &&
      stored.entries !== null;

    if (valid) {
      for (const [key, entry] of Object.entries(stored.entries)) {
        try {
          const queryKey = JSON.parse(key) as unknown[];
          // Keep the original timestamp so restored data is stale (not "fresh as of now")
          // and refetches on mount when online.
          if (queryClient.getQueryData(queryKey) === undefined) {
            queryClient.setQueryData(queryKey, entry.data, { updatedAt: entry.updatedAt });
          }
        } catch {
          // Skip malformed entries
        }
      }
    } else {
      queryClient.clear();
      await deletePersisted();
      if (gen !== generation) return;
    }
  }

  startPersisting(owner, gen);
}

/**
 * Called on logout or any transition to logged-out. Clears the in-memory cache and,
 * unless `keepPersisted` is set, the persisted one.
 *
 * `keepPersisted` is for a refresh that failed because the network is down (not
 * because the session was rejected): the persisted cache stays on disk but remains
 * owner-scoped, so a different user logging in later still discards it.
 */
export async function clearCache({ keepPersisted = false } = {}): Promise<void> {
  generation++;
  currentOwner = null;
  stopPersisting();
  queryClient.clear();
  if (!keepPersisted) await deletePersisted();
}

/** Test helper: reset module state. */
export function __resetQueryPersistenceForTests() {
  generation++;
  currentOwner = null;
  stopPersisting();
}
