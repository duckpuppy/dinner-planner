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
    preparations: { dishId: null, id: null, preparedDate: null, restaurantId: null },
    ratings: { stars: null, id: null, preparationId: null },
    restaurants: { archived: null, id: null, cuisineType: null },
    restaurantDishes: { restaurantId: null, id: null },
    restaurantDishRatings: {
      restaurantDishId: null,
      id: null,
      stars: null,
      userId: null,
      note: null,
    },
    users: { id: null, displayName: null },
  },
}));

const mockGetSettings = vi.hoisted(() => vi.fn().mockResolvedValue({ recencyWindowDays: 30 }));

vi.mock('../services/settings.js', () => ({
  getSettings: mockGetSettings,
}));

import {
  scoreDish,
  buildReasons,
  getSuggestions,
  getRestaurantSuggestions,
  getDishSuggestions,
} from '../services/suggestions.js';

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

    const result = await getSuggestions({
      exclude: [],
      limit: 10,
      dietaryTags: [],
      tag: 'italian',
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('d1');
  });

  it('returns empty when tag filter matches nothing', async () => {
    const dishes = [makeDish('d1')];
    setupSuggestionsMocks(dishes, {
      tagRows: [{ dishId: 'd1', tagName: 'italian' }],
    });

    const result = await getSuggestions({
      exclude: [],
      limit: 10,
      dietaryTags: [],
      tag: 'mexican',
    });

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

// ---------------------------------------------------------------------------
// getRestaurantSuggestions
// ---------------------------------------------------------------------------

function makeRestaurant(
  id: string,
  name = 'Taco Place',
  cuisineType: string | null = 'Mexican',
  archived = false
) {
  return { id, name, cuisineType, location: null, archived };
}

/**
 * Set up the 3 DB calls for getRestaurantSuggestions:
 * 1. select().from(restaurants).where() → allRestaurants
 * 2. select({}).from(restaurantDishes).innerJoin(restaurantDishRatings).where().groupBy() → ratingStats
 * 3. select({}).from(preparations).where().groupBy() → visitStats
 */
function setupRestaurantSuggestionsMocks(
  restaurants: ReturnType<typeof makeRestaurant>[],
  opts: {
    ratingStats?: { restaurantId: string; avgRating: number; totalRatings: number }[];
    visitStats?: { restaurantId: string; visitCount: number; lastVisitedDate: string }[];
  } = {}
) {
  mockDb.select.mockReturnValueOnce(selFromWhere(restaurants)); // restaurants
  mockDb.select.mockReturnValueOnce(selFromInnerJoinWhereGroupBy(opts.ratingStats ?? [])); // ratingStats
  mockDb.select.mockReturnValueOnce(selFromWhereGroupBy(opts.visitStats ?? [])); // visitStats
}

describe('getRestaurantSuggestions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetSettings.mockResolvedValue({ recencyWindowDays: 30 });
  });

  it('returns empty array when no restaurants exist', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhere([]));

    const result = await getRestaurantSuggestions({ limit: 5, exclude: [] });

    expect(result).toEqual([]);
  });

  it('returns scored restaurants sorted by score desc', async () => {
    const rs = [makeRestaurant('r1', 'Sushi Bar'), makeRestaurant('r2', 'Burger Joint')];
    setupRestaurantSuggestionsMocks(rs, {
      ratingStats: [{ restaurantId: 'r1', avgRating: 5, totalRatings: 2 }],
    });

    const result = await getRestaurantSuggestions({ limit: 10 });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('r1');
    expect(result[0].averageRating).toBe(5);
    expect(result[1].id).toBe('r2');
    expect(result[1].averageRating).toBeNull();
  });

  it('respects limit', async () => {
    const rs = [makeRestaurant('r1'), makeRestaurant('r2'), makeRestaurant('r3')];
    setupRestaurantSuggestionsMocks(rs);

    const result = await getRestaurantSuggestions({ limit: 2 });

    expect(result).toHaveLength(2);
  });

  it('attaches visitCount and lastVisitedDate from visitStats', async () => {
    const rs = [makeRestaurant('r1')];
    setupRestaurantSuggestionsMocks(rs, {
      visitStats: [{ restaurantId: 'r1', visitCount: 3, lastVisitedDate: '2024-05-01' }],
    });

    const result = await getRestaurantSuggestions({ limit: 5 });

    expect(result[0].visitCount).toBe(3);
    expect(result[0].lastVisitedDate).toBe('2024-05-01');
  });

  it('filters by cuisineType', async () => {
    // cuisineType filter is applied in DB query (baseConditions), so the mock
    // only returns matching restaurants when we control the mock data
    const rs = [makeRestaurant('r1', 'Sushi Bar', 'Japanese')];
    setupRestaurantSuggestionsMocks(rs);

    const result = await getRestaurantSuggestions({ cuisineType: 'Japanese' });

    expect(result).toHaveLength(1);
    expect(result[0].cuisineType).toBe('Japanese');
  });

  it('includes "Never visited" reason when no visits', async () => {
    const rs = [makeRestaurant('r1')];
    setupRestaurantSuggestionsMocks(rs);

    const result = await getRestaurantSuggestions({});

    expect(result[0].reasons).toContain('Never visited');
  });

  it('includes "Highly rated" reason for avg >= 4', async () => {
    const rs = [makeRestaurant('r1')];
    setupRestaurantSuggestionsMocks(rs, {
      ratingStats: [{ restaurantId: 'r1', avgRating: 4.5, totalRatings: 2 }],
    });

    const result = await getRestaurantSuggestions({});

    expect(result[0].reasons.some((r) => r.startsWith('Highly rated'))).toBe(true);
  });

  it('includes "Family favorite" reason when >= 3 ratings and avg >= 4', async () => {
    const rs = [makeRestaurant('r1')];
    setupRestaurantSuggestionsMocks(rs, {
      ratingStats: [{ restaurantId: 'r1', avgRating: 4.5, totalRatings: 3 }],
    });

    const result = await getRestaurantSuggestions({});

    expect(result[0].reasons).toContain('Family favorite');
  });

  it('does not include "Family favorite" when fewer than 3 ratings', async () => {
    const rs = [makeRestaurant('r1')];
    setupRestaurantSuggestionsMocks(rs, {
      ratingStats: [{ restaurantId: 'r1', avgRating: 5, totalRatings: 2 }],
    });

    const result = await getRestaurantSuggestions({});

    expect(result[0].reasons).not.toContain('Family favorite');
  });

  it('excludes specified restaurant IDs via query (mock returns filtered list)', async () => {
    // The exclude filter is pushed to DB (baseConditions), so the mock only
    // returns the non-excluded set when we control the mock data
    const rs = [makeRestaurant('r2', 'Burger Joint')];
    setupRestaurantSuggestionsMocks(rs);

    const result = await getRestaurantSuggestions({ exclude: ['r1'] });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r2');
  });
});

// ---------------------------------------------------------------------------
// getDishSuggestions
// ---------------------------------------------------------------------------

function makeDishRow(id: string, restaurantId: string, name: string, notes: string | null = null) {
  return { id, restaurantId, name, notes };
}

function makeRatingRow(
  id: string,
  restaurantDishId: string,
  userId: string,
  displayName: string,
  stars: number,
  note: string | null = null
) {
  return { id, restaurantDishId, userId, displayName, stars, note };
}

/**
 * Set up the 2 DB calls for getDishSuggestions:
 * 1. select().from(restaurantDishes).where() → dishes
 * 2. select({}).from(restaurantDishRatings).innerJoin(users).where() → ratings
 */
function setupDishSuggestionsMocks(
  dishes: ReturnType<typeof makeDishRow>[],
  ratings: ReturnType<typeof makeRatingRow>[] = []
) {
  mockDb.select.mockReturnValueOnce(selFromWhere(dishes));
  mockDb.select.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(ratings) }),
    }),
  });
}

describe('getDishSuggestions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns empty array for restaurant with no dishes', async () => {
    mockDb.select.mockReturnValueOnce(selFromWhere([]));

    const result = await getDishSuggestions('r1', { limit: 10 });

    expect(result).toEqual([]);
  });

  it('returns dishes sorted by rating highest first', async () => {
    const dishes = [makeDishRow('d1', 'r1', 'Tacos'), makeDishRow('d2', 'r1', 'Burrito')];
    const ratings = [
      makeRatingRow('rat1', 'd1', 'u1', 'Alice', 5),
      makeRatingRow('rat2', 'd2', 'u1', 'Alice', 3),
    ];
    setupDishSuggestionsMocks(dishes, ratings);

    const result = await getDishSuggestions('r1', {});

    expect(result[0].id).toBe('d1');
    expect(result[0].averageRating).toBe(5);
    expect(result[1].id).toBe('d2');
    expect(result[1].averageRating).toBe(3);
  });

  it('places unrated dishes at the end', async () => {
    const dishes = [makeDishRow('d1', 'r1', 'Tacos'), makeDishRow('d2', 'r1', 'Mystery Dish')];
    const ratings = [makeRatingRow('rat1', 'd1', 'u1', 'Alice', 4)];
    setupDishSuggestionsMocks(dishes, ratings);

    const result = await getDishSuggestions('r1', {});

    expect(result[0].id).toBe('d1');
    expect(result[1].id).toBe('d2');
    expect(result[1].averageRating).toBeNull();
  });

  it('includes per-user rating breakdowns', async () => {
    const dishes = [makeDishRow('d1', 'r1', 'Tacos')];
    const ratings = [
      makeRatingRow('rat1', 'd1', 'u1', 'Alice', 5, 'Amazing!'),
      makeRatingRow('rat2', 'd1', 'u2', 'Bob', 4, null),
    ];
    setupDishSuggestionsMocks(dishes, ratings);

    const result = await getDishSuggestions('r1', {});

    expect(result[0].userRatings).toHaveLength(2);
    expect(result[0].userRatings[0]).toMatchObject({
      userId: 'u1',
      displayName: 'Alice',
      stars: 5,
      note: 'Amazing!',
    });
    expect(result[0].userRatings[1]).toMatchObject({ userId: 'u2', displayName: 'Bob', stars: 4 });
  });

  it('generates "Top pick" reason for avgRating >= 4.5', async () => {
    const dishes = [makeDishRow('d1', 'r1', 'Tacos')];
    const ratings = [makeRatingRow('rat1', 'd1', 'u1', 'Alice', 5)];
    setupDishSuggestionsMocks(dishes, ratings);

    const result = await getDishSuggestions('r1', {});

    expect(result[0].reasons).toContain('Top pick');
  });

  it('generates "Highly rated" reason for avgRating >= 4.0 but < 4.5', async () => {
    const dishes = [makeDishRow('d1', 'r1', 'Tacos')];
    const ratings = [
      makeRatingRow('rat1', 'd1', 'u1', 'Alice', 4),
      makeRatingRow('rat2', 'd1', 'u2', 'Bob', 4),
    ];
    setupDishSuggestionsMocks(dishes, ratings);

    const result = await getDishSuggestions('r1', {});

    expect(result[0].reasons).toContain('Highly rated');
    expect(result[0].reasons).not.toContain('Top pick');
  });

  it('generates "Family favorite" when >= 3 ratings and avgRating >= 4.0', async () => {
    const dishes = [makeDishRow('d1', 'r1', 'Tacos')];
    const ratings = [
      makeRatingRow('rat1', 'd1', 'u1', 'Alice', 5),
      makeRatingRow('rat2', 'd1', 'u2', 'Bob', 4),
      makeRatingRow('rat3', 'd1', 'u3', 'Carol', 5),
    ];
    setupDishSuggestionsMocks(dishes, ratings);

    const result = await getDishSuggestions('r1', {});

    expect(result[0].reasons).toContain('Family favorite');
  });

  it('does not generate "Family favorite" with fewer than 3 ratings', async () => {
    const dishes = [makeDishRow('d1', 'r1', 'Tacos')];
    const ratings = [
      makeRatingRow('rat1', 'd1', 'u1', 'Alice', 5),
      makeRatingRow('rat2', 'd1', 'u2', 'Bob', 5),
    ];
    setupDishSuggestionsMocks(dishes, ratings);

    const result = await getDishSuggestions('r1', {});

    expect(result[0].reasons).not.toContain('Family favorite');
  });

  it('generates "Not yet rated — try it!" for unrated dishes', async () => {
    const dishes = [makeDishRow('d1', 'r1', 'Tacos')];
    setupDishSuggestionsMocks(dishes, []);

    const result = await getDishSuggestions('r1', {});

    expect(result[0].averageRating).toBeNull();
    expect(result[0].reasons).toContain('Not yet rated — try it!');
  });

  it('respects limit parameter', async () => {
    const dishes = [
      makeDishRow('d1', 'r1', 'Tacos'),
      makeDishRow('d2', 'r1', 'Burrito'),
      makeDishRow('d3', 'r1', 'Quesadilla'),
    ];
    const ratings = [
      makeRatingRow('rat1', 'd1', 'u1', 'Alice', 5),
      makeRatingRow('rat2', 'd2', 'u1', 'Alice', 4),
      makeRatingRow('rat3', 'd3', 'u1', 'Alice', 3),
    ];
    setupDishSuggestionsMocks(dishes, ratings);

    const result = await getDishSuggestions('r1', { limit: 2 });

    expect(result).toHaveLength(2);
  });
});
