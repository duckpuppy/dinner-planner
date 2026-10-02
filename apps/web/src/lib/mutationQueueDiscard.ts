import { del, get } from 'idb-keyval';
import { toast } from 'sonner';

/** Persisted offline mutation queue (written by the queue feature, dinner-4kj.9). */
export const MUTATION_QUEUE_KEY = 'dinner-planner-mutation-queue';

function countMutations(stored: unknown): number {
  if (Array.isArray(stored)) return stored.length;
  if (typeof stored === 'object' && stored !== null) {
    const s = stored as { mutations?: unknown; clientState?: { mutations?: unknown } };
    if (Array.isArray(s.mutations)) return s.mutations.length;
    if (Array.isArray(s.clientState?.mutations)) return s.clientState.mutations.length;
  }
  return 0;
}

/**
 * Delete the persisted mutation queue and return how many mutations it held. Safe when the
 * key does not exist or idb is unavailable.
 */
export async function discardPersistedMutationQueue(): Promise<number> {
  let count = 0;
  try {
    count = countMutations(await get<unknown>(MUTATION_QUEUE_KEY));
  } catch {
    // Treat unreadable as empty
  }
  try {
    await del(MUTATION_QUEUE_KEY);
  } catch {
    // Ignore
  }
  return count;
}

/** Discard the queue and tell the user if anything was lost. */
export async function discardQueueAndNotify(): Promise<number> {
  const count = await discardPersistedMutationQueue();
  if (count > 0) {
    toast.error(
      `${count} unsynced ${count === 1 ? 'change was' : 'changes were'} discarded because you were signed out`
    );
  }
  return count;
}
