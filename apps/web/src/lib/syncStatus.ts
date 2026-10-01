/**
 * Stub for the offline mutation queue's status (filled in by the queue bead, dinner-4kj.9).
 * Kept as a tiny module so the banner can already depend on its final shape.
 */
export function usePendingSyncCount(): number {
  return 0;
}

export function useFailedSyncCount(): number {
  return 0;
}

export function retryFailed(): void {
  // No-op until the offline mutation queue exists.
}
