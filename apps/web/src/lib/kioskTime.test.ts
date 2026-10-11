import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { msUntilNextMidnight, msUntilNextMinute, nextLocalMidnight } from './kioskTime';

const HOUR = 3_600_000;

describe('kioskTime', () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('returns the next local midnight on an ordinary day', () => {
    const next = nextLocalMidnight(new Date(2026, 5, 10, 18, 30));
    expect([next.getFullYear(), next.getMonth(), next.getDate(), next.getHours()]).toEqual([
      2026, 5, 11, 0,
    ]);
    expect(msUntilNextMidnight(new Date(2026, 5, 10, 18, 30))).toBe(5.5 * HOUR);
  });

  it('rolls over month and year boundaries', () => {
    const next = nextLocalMidnight(new Date(2026, 11, 31, 23, 59));
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2027, 0, 1]);
  });

  it('is DST-safe on the 23-hour spring-forward day', () => {
    // 2026-03-08 00:30 local; the day is 23h long, so 22.5h remain, not 23.5h.
    expect(msUntilNextMidnight(new Date(2026, 2, 8, 0, 30))).toBe(22.5 * HOUR);
  });

  it('is DST-safe on the 25-hour fall-back day', () => {
    // 2026-11-01 00:30 local; the day is 25h long, so 24.5h remain.
    expect(msUntilNextMidnight(new Date(2026, 10, 1, 0, 30))).toBe(24.5 * HOUR);
  });

  it('never returns a negative delay', () => {
    expect(msUntilNextMidnight(new Date(2026, 5, 10, 23, 59, 59, 999))).toBe(1);
  });

  it('computes time to the next minute boundary', () => {
    expect(msUntilNextMinute(new Date(2026, 5, 10, 12, 0, 15, 500))).toBe(44_500);
    expect(msUntilNextMinute(new Date(2026, 5, 10, 12, 0, 0, 0))).toBe(60_000);
  });
});
