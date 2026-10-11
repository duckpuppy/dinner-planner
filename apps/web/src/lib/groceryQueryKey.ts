import type { QueryClient } from '@tanstack/react-query';
import { getWeekStartDate, localDateStr } from './utils';

/** Normal grocery polling cadence. */
export const GROCERY_POLL_MS = 5000;
/** Slow polling used once a live (SSE) connection is up. Reserved for dinner-4kj.10. */
export const GROCERY_POLL_LIVE_MS = 60_000;

function parseLocalDate(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * Query key for a week's groceries: ['groceries', <week start date>].
 * Keyed by the week start (not the requested day) so the cache entry survives the day rolling
 * over while offline. Until settings (weekStartDay) are known, falls back to the requested date.
 */
export function groceriesQueryKey(
  requestedDate: string,
  weekStartDay: number | undefined
): readonly ['groceries', string] {
  if (weekStartDay === undefined) return ['groceries', requestedDate];
  const d = parseLocalDate(requestedDate);
  if (!d) return ['groceries', requestedDate];
  return ['groceries', localDateStr(getWeekStartDate(d, weekStartDay))];
}

/**
 * refetchInterval for the groceries query. Paused while offline grocery writes are queued, so
 * a refetch can't land between a write and its replay.
 *
 * `liveConnected` is the hook for the SSE bead (dinner-4kj.10): when a live connection is up,
 * polling drops to GROCERY_POLL_LIVE_MS as a safety net.
 */
export function groceryRefetchInterval(
  client: QueryClient,
  { liveConnected = false }: { liveConnected?: boolean } = {}
): number | false {
  if (client.isMutating({ mutationKey: ['offline', 'grocery'] }) > 0) return false;
  return liveConnected ? GROCERY_POLL_LIVE_MS : GROCERY_POLL_MS;
}
