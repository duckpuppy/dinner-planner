import { useMutationState } from '@tanstack/react-query';
import { takeFailed, useFailedEntries } from './failedSyncStore';
import { enqueueByKey } from './offlineMutations';

/** Number of offline changes queued and not yet synced (paused, in flight or retrying). */
export function usePendingSyncCount(): number {
  return useMutationState({
    filters: { mutationKey: ['offline'], status: 'pending' },
    select: () => 1,
  }).length;
}

/** Number of changes the server rejected for good. */
export function useFailedSyncCount(): number {
  return useFailedEntries().length;
}

/** Put every failed change back on the queue. */
export function retryFailed(): void {
  for (const entry of takeFailed()) void enqueueByKey(entry.key, entry.vars);
}
