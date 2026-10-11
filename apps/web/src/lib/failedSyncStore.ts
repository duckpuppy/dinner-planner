import { useSyncExternalStore } from 'react';

/**
 * Offline changes the server permanently rejected (non-retryable 4xx or exhausted retries).
 * Kept in memory only: the mutation was dropped from the queue, and `retryFailed()` in
 * syncStatus.ts re-enqueues these entries.
 */
export interface FailedEntry {
  key: readonly unknown[];
  vars: unknown;
  message: string;
}

let entries: readonly FailedEntry[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function recordFailed(entry: FailedEntry): void {
  entries = [...entries, entry];
  emit();
}

/** Remove and return every failed entry (used when retrying). */
export function takeFailed(): FailedEntry[] {
  const taken = [...entries];
  entries = [];
  emit();
  return taken;
}

export function getFailed(): readonly FailedEntry[] {
  return entries;
}

export function clearFailed(): void {
  if (entries.length === 0) return;
  entries = [];
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useFailedEntries(): readonly FailedEntry[] {
  return useSyncExternalStore(subscribe, getFailed, getFailed);
}
