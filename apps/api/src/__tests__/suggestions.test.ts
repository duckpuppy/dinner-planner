import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
  and: vi.fn().mockReturnValue(null),
  notInArray: vi.fn().mockReturnValue(null),
  inArray: vi.fn().mockReturnValue(null),
  sql: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    dishes: { archived: null, type: null, id: null },
    dishTags: { dishId: null, tagId: null },
    dishDietaryTags: { dishId: null, tag: null },
    tags: { name: null, id: null },
    preparations: { dishId: null, id: null, preparedDate: null },
    ratings: { stars: null, id: null, preparationId: null },
  },
}));

const mockGetSettings = vi.hoisted(() => vi.fn().mockResolvedValue({ recencyWindowDays: 30 }));

vi.mock('../services/settings.js', () => ({
  getSettings: mockGetSettings,
}));

import { scoreDish, buildReasons, getSuggestions } from '../services/suggestions.js';

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

  it('reports "Last made about a week ago" when recency window is small enough', () => {
    // With recencyWindowDays=5, daysSince=7 → 7>=5 AND round(7/7)=1 week
    const reasons = buildReasons(null, 0, '2024-06-08', 5, TODAY);
    expect(reasons[1]).toBe('Last made about a week ago');
  });
});

// ---------------------------------------------------------------------------
// Chain mock helpers for getSuggestions
// ---------------------------------------------------------------------------

function selFromWhere(result: unknown[]) {
  return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(result) }) };
}

function selFromInnerJoinWhere(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(result) }),
    }),
  };
}

function selFromInnerJoinWhereGroupBy(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ groupBy: vi.fn().mockResolvedValue(result) }),
      }),
    }),
  };
}

function selFromWhereGroupBy(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ groupBy: vi.fn().mockResolvedValue(result) }),
    }),
  };
}

function makeDish(id: string, name = 'Pasta', type = 'main') {
  return { id, name, type, description: '', archived: false };
}

/**
 * Set up the 5 DB calls for getSuggestions:
 * 1. select().from(dishes).where() → allDishes
 * 2. select({}).from(dishTags).innerJoin(tags).where() → dishTagRows
 * 3. select({}).from(dishDietaryTags).where() → dietaryTagRows
 * 4. select({}).from(preparations).innerJoin(ratings).where().groupBy() → ratingStats
 * 5. select({}).from(preparations).where().groupBy() → recentPreps
 */
function setupSuggestionsMocks(
  dishes: ReturnType<typeof makeDish>[],
  opts: {
    tagRows?: { dishId: string; tagName: string }[];
    dietaryRows?: { dishId: string; tag: string }[];
    ratingStats?: { dishId: string; avgRating: number; totalRatings: number }[];
    recentPreps?: { dishId: string; lastPreparedDate: string }[];
  } = {}
) {
  mockDb.select.mockReturnValueOnce(selFromWhere(dishes)); // dishes
  mockDb.select.mockReturnValueOnce(selFromInnerJoinWhere(opts.tagRows ?? [])); // dishTags
  mockDb.select.mockReturnValueOnce(selFromWhere(opts.dietaryRows ?? [])); // dietaryTagRows
  mockDb.select.mockReturnValueOnce(selFromInnerJoinWhereGroupBy(opts.ratingStats ?? [])); // ratings
  mockDb.select.mockReturnValueOnce(selFromWhereGroupBy(opts.recentPreps ?? [])); // recentPreps
}

describe('getSuggestions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetSettings.mockResolvedValue({ recencyWindowDays: 30 });
  });

  it('returns empty array when no dishes match', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhere([]));

    const result = await getSuggestions({ exclude: [], limit: 5, dietaryTags: [] });

    expect(result).toEqual([]);
  });

  it('returns scored dishes sorted by score desc', async () => {
    const dishes = [makeDish('d1', 'Pasta'), makeDish('d2', 'Soup')];
    setupSuggestionsMocks(dishes, {
      ratingStats: [{ dishId: 'd1', avgRating: 5, totalRatings: 2 }],
    });

    const result = await getSuggestions({ exclude: [], limit: 10, dietaryTags: [] });

    expect(result).toHaveLength(2);
    // d1 has rating 5, d2 has neutral 3 → d1 should be first
    expect(result[0].id).toBe('d1');
    expect(result[0].avgRating).toBe(5);
    expect(result[1].id).toBe('d2');
    expect(result[1].avgRating).toBeNull();
  });

  it('respects limit', async () => {
    const dishes = [makeDish('d1'), makeDish('d2'), makeDish('d3')];
    setupSuggestionsMocks(dishes);

    const result = await getSuggestions({ exclude: [], limit: 2, dietaryTags: [] });

    expect(result).toHaveLength(2);
  });

  it('filters by free-form tag', async () => {
    const dishes = [makeDish('d1', 'Pasta'), makeDish('d2', 'Soup')];
    setupSuggestionsMocks(dishes, {
      tagRows: [{ dishId: 'd1', tagName: 'italian' }],
    });

    const result = await getSuggestions({ exclude: [], limit: 10, dietaryTags: [], tag: 'italian' });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('d1');
  });

  it('returns empty when tag filter matches nothing', async () => {
    const dishes = [makeDish('d1')];
    setupSuggestionsMocks(dishes, {
      tagRows: [{ dishId: 'd1', tagName: 'italian' }],
    });

    const result = await getSuggestions({ exclude: [], limit: 10, dietaryTags: [], tag: 'mexican' });

    expect(result).toEqual([]);
  });

  it('filters by dietary tags (must have ALL)', async () => {
    const dishes = [makeDish('d1'), makeDish('d2')];
    setupSuggestionsMocks(dishes, {
      dietaryRows: [
        { dishId: 'd1', tag: 'vegan' },
        { dishId: 'd1', tag: 'gluten_free' },
        { dishId: 'd2', tag: 'vegan' },
      ],
    });

    const result = await getSuggestions({
      exclude: [],
      limit: 10,
      dietaryTags: ['vegan', 'gluten_free'],
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('d1');
  });

  it('attaches tags and dietaryTags to result', async () => {
    const dishes = [makeDish('d1', 'Pasta')];
    setupSuggestionsMocks(dishes, {
      tagRows: [{ dishId: 'd1', tagName: 'italian' }],
      dietaryRows: [{ dishId: 'd1', tag: 'vegan' }],
    });

    const result = await getSuggestions({ exclude: [], limit: 10, dietaryTags: [] });

    expect(result[0].tags).toEqual(['italian']);
  });

  it('attaches lastPreparedDate from recentPreps', async () => {
    const dishes = [makeDish('d1')];
    setupSuggestionsMocks(dishes, {
      recentPreps: [{ dishId: 'd1', lastPreparedDate: '2024-06-01' }],
    });

    const result = await getSuggestions({ exclude: [], limit: 10, dietaryTags: [] });

    expect(result[0].lastPreparedDate).toBe('2024-06-01');
  });

  it('returns empty when filteredDishes is empty after dietary tag filter', async () => {
    const dishes = [makeDish('d1')];
    setupSuggestionsMocks(dishes, {
      dietaryRows: [],
    });

    const result = await getSuggestions({
      exclude: [],
      limit: 10,
      dietaryTags: ['vegan'],
    });

    expect(result).toEqual([]);
  });
});
