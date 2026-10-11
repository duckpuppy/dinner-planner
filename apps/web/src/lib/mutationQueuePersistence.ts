import { del, get, set } from 'idb-keyval';
import { toast } from 'sonner';
import { dehydrate, hydrate, type DehydratedState } from '@tanstack/react-query';
import {
  createCustomItemSchema,
  createPantryItemSchema,
  createStandingItemSchema,
} from '@dinner-planner/shared';
import { queryClient } from './queryClient';
// Registers the mutation defaults. MUST be imported before anything hydrates the queue.
import './offlineMutations';
import { opName } from './pendingOps';

/**
 * Persistence for the offline mutation queue (dinner-4kj.9). Separate from the query cache
 * (queryPersistence.ts) on purpose: it is NOT tied to CACHE_VERSION / the app version, because
 * a new build must never silently throw away a user's unsynced changes.
 */

export const QUEUE_KEY = 'dinner-planner-mutation-queue';
export const QUEUE_SCHEMA = 1;
const SAVE_DEBOUNCE_MS = 100;

export interface QueueOwner {
  userId: string;
  familyId: string;
}

type DehydratedMutation = DehydratedState['mutations'][number];

interface PersistedQueue {
  queueSchema: number;
  userId: string;
  familyId: string;
  mutations: DehydratedMutation[];
}

let activeOwner: QueueOwner | null = null;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let unsubscribe: (() => void) | undefined;
let removeListeners: (() => void) | undefined;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Validate persisted variables against the shared schemas (or the equivalent shape check). */
function validVars(name: string, v: unknown): boolean {
  if (!isRecord(v)) return false;
  switch (name) {
    case 'grocery.check.set':
      return (
        isStr(v.weekDate) &&
        isStr(v.itemKey) &&
        isStr(v.itemName) &&
        typeof v.checked === 'boolean' &&
        isTime(v.clientUpdatedAt)
      );
    case 'grocery.check.clear':
      return isStr(v.weekDate) && isTime(v.clientUpdatedAt);
    case 'grocery.custom.add':
      return isId(v.id) && createCustomItemSchema.safeParse(v).success;
    case 'grocery.standing.add':
      return isId(v.id) && createStandingItemSchema.safeParse(v).success;
    case 'pantry.add':
      return isId(v.id) && createPantryItemSchema.safeParse(v).success;
    case 'grocery.custom.delete':
    case 'grocery.standing.delete':
    case 'pantry.delete':
      return isId(v.id);
    default:
      return false;
  }
}

function isValidMutation(m: unknown): m is DehydratedMutation {
  if (!isRecord(m) || !Array.isArray(m.mutationKey) || m.mutationKey[0] !== 'offline') return false;
  if (!isRecord(m.state)) return false;
  return validVars(opName(m.mutationKey), m.state.variables);
}

export async function deletePersistedQueue(): Promise<void> {
  try {
    await del(QUEUE_KEY);
  } catch {
    // Ignore
  }
}

/**
 * Count the persisted queue's entries and delete it. For logout paths that must warn the user
 * before discarding unsynced changes.
 */
export async function countAndDiscardPersistedQueue(): Promise<number> {
  let count: number;
  try {
    const stored = await get<PersistedQueue>(QUEUE_KEY);
    count = Array.isArray(stored?.mutations) ? stored.mutations.length : 0;
  } catch {
    count = 0;
  }
  await deletePersistedQueue();
  return count;
}

/**
 * Discard the persisted queue and tell the user if anything was lost. Idempotent: the second
 * caller finds nothing and stays quiet, so every logout path can call it.
 */
export async function discardQueueAndNotify(): Promise<number> {
  const count = await countAndDiscardPersistedQueue();
  if (count > 0) {
    toast.error(
      `${count} unsynced ${count === 1 ? 'change was' : 'changes were'} discarded because you were signed out`
    );
  }
  return count;
}

/** Drop every in-memory offline mutation and the persisted queue (in-session owner change). */
export async function resetMutationQueue(): Promise<void> {
  queryClient.getMutationCache().clear();
  await discardQueueAndNotify();
}

/**
 * Restore the persisted queue for `owner`. Call after the owner match is established and
 * before the authenticated UI renders. A queue that belongs to another user/family, or that
 * has an unknown schema, is deleted. `isCurrent` lets the caller abort if the owner changed
 * (logout) while the idb read was in flight.
 */
export async function restoreMutationQueue(
  owner: QueueOwner,
  isCurrent: () => boolean = () => true
): Promise<void> {
  let stored: PersistedQueue | undefined;
  try {
    stored = await get<PersistedQueue>(QUEUE_KEY);
  } catch {
    stored = undefined;
  }
  if (!isCurrent() || !stored) return;

  const matches =
    isRecord(stored) &&
    stored.queueSchema === QUEUE_SCHEMA &&
    stored.userId === owner.userId &&
    stored.familyId === owner.familyId &&
    Array.isArray(stored.mutations);
  if (!matches) {
    await deletePersistedQueue();
    return;
  }

  const restored = stored.mutations.filter(isValidMutation).map<DehydratedMutation>((m) => ({
    ...m,
    // Replayed from scratch: forget the old attempt. `isPaused` must be true, otherwise
    // resumePausedMutations() skips it.
    state: {
      ...m.state,
      status: 'pending',
      isPaused: true,
      error: null,
      failureCount: 0,
      failureReason: null,
      context: undefined,
      data: undefined,
    },
  }));

  if (restored.length > 0) {
    hydrate(queryClient, { mutations: restored, queries: [] });
    // No-op while offline; onlineManager resumes them on reconnect.
    void queryClient.resumePausedMutations();
  }
}

async function saveQueue(owner: QueueOwner): Promise<void> {
  const { mutations } = dehydrate(queryClient, {
    shouldDehydrateQuery: () => false,
    shouldDehydrateMutation: (m) =>
      m.state.status === 'pending' && m.options.mutationKey?.[0] === 'offline',
  });
  if (activeOwner !== owner) return;
  try {
    if (mutations.length === 0) {
      await del(QUEUE_KEY);
      return;
    }
    const payload: PersistedQueue = {
      queueSchema: QUEUE_SCHEMA,
      userId: owner.userId,
      familyId: owner.familyId,
      mutations: mutations.map((m) => ({
        ...m,
        // Errors and contexts don't need to survive a restart (and may not structured-clone).
        state: { ...m.state, error: null, failureReason: null, context: undefined },
      })),
    };
    await set(QUEUE_KEY, payload);
  } catch {
    // Ignore persistence errors
  }
}

/** Start saving the queue whenever the mutation cache changes. Stops any previous run. */
export function startQueuePersistence(owner: QueueOwner): void {
  stopQueuePersistence();
  activeOwner = owner;

  const flush = () => {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    void saveQueue(owner);
  };

  unsubscribe = queryClient.getMutationCache().subscribe(() => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
  });

  // The page can be killed right after being hidden, so don't wait for the debounce.
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', flush);
  removeListeners = () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', flush);
  };
}

export function stopQueuePersistence(): void {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  unsubscribe?.();
  unsubscribe = undefined;
  removeListeners?.();
  removeListeners = undefined;
  activeOwner = null;
}
