/**
 * The next local midnight after `now`. Built from calendar fields (`new Date(y, m, d + 1)`)
 * rather than `now + 24h`, so a 23h or 25h DST day still lands on a real midnight.
 */
export function nextLocalMidnight(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}

/** Milliseconds from `now` until the next local midnight (never negative). */
export function msUntilNextMidnight(now: Date): number {
  return Math.max(nextLocalMidnight(now).getTime() - now.getTime(), 0);
}

/** Milliseconds until the next minute boundary (1..60000), for a clock that ticks on the minute. */
export function msUntilNextMinute(now: Date): number {
  return 60_000 - (now.getSeconds() * 1000 + now.getMilliseconds());
}
