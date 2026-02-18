import { describe, it, expect } from 'vitest';
import { scoreDish, buildReasons } from '../services/suggestions.js';

const TODAY = '2024-06-15';

describe('scoreDish', () => {
  it('returns avgRating as base when never prepared', () => {
    expect(scoreDish(4.0, null, 30, TODAY)).toBe(4.0);
  });

  it('uses neutral base (3) when unrated and never prepared', () => {
    expect(scoreDish(null, null, 30, TODAY)).toBe(3);
  });

  it('applies full recency penalty when prepared today', () => {
    // penalty = 2 * max(0, 1 - 0/30) = 2
    expect(scoreDish(4.0, TODAY, 30, TODAY)).toBeCloseTo(2.0);
  });

  it('applies partial recency penalty within window', () => {
    // 15 days ago → penalty = 2 * (1 - 15/30) = 1
    expect(scoreDish(4.0, '2024-05-31', 30, TODAY)).toBeCloseTo(3.0);
  });

  it('applies no recency penalty at or beyond window', () => {
    // exactly 30 days ago → penalty = 2 * (1 - 30/30) = 0
    expect(scoreDish(4.0, '2024-05-16', 30, TODAY)).toBeCloseTo(4.0);
    // 60 days ago → still no penalty
    expect(scoreDish(4.0, '2024-04-16', 30, TODAY)).toBeCloseTo(4.0);
  });

  it('ranks unrated never-made dish above recently-made unrated dish', () => {
    const neverMade = scoreDish(null, null, 30, TODAY);
    const madeYesterday = scoreDish(null, '2024-06-14', 30, TODAY);
    expect(neverMade).toBeGreaterThan(madeYesterday);
  });
});

describe('buildReasons', () => {
  it('reports "Not yet rated" when no ratings', () => {
    const reasons = buildReasons(null, 0, null, 30, TODAY);
    expect(reasons).toContain('Not yet rated');
  });

  it('reports rating with count', () => {
    const reasons = buildReasons(4.5, 3, null, 30, TODAY);
    expect(reasons[0]).toBe('Rated 4.5 ★ (3 ratings)');
  });

  it('uses singular "rating" for 1 rating', () => {
    const reasons = buildReasons(5.0, 1, null, 30, TODAY);
    expect(reasons[0]).toBe('Rated 5.0 ★ (1 rating)');
  });

  it('reports "Never made before" when no preparations', () => {
    const reasons = buildReasons(null, 0, null, 30, TODAY);
    expect(reasons).toContain('Never made before');
  });

  it('reports "Made today"', () => {
    const reasons = buildReasons(null, 0, TODAY, 30, TODAY);
    expect(reasons).toContain('Made today');
  });

  it('reports "Made yesterday"', () => {
    const reasons = buildReasons(null, 0, '2024-06-14', 30, TODAY);
    expect(reasons).toContain('Made yesterday');
  });

  it('reports days ago within window', () => {
    const reasons = buildReasons(null, 0, '2024-06-05', 30, TODAY);
    expect(reasons).toContain('Made 10 days ago');
  });

  it('reports weeks ago beyond window', () => {
    const reasons = buildReasons(null, 0, '2024-05-01', 30, TODAY);
    expect(reasons[1]).toMatch(/weeks? ago/);
  });

  it('reports months ago for old preparations', () => {
    const reasons = buildReasons(null, 0, '2024-01-01', 30, TODAY);
    expect(reasons[1]).toMatch(/month/);
  });
});
