import { eq, and, notInArray, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type {
  SuggestionsQueryInput,
  SuggestedDish,
  SuggestedRestaurant,
  SuggestedRestaurantDish,
} from '@dinner-planner/shared';
import { getSettings } from './settings.js';

// Returns YYYY-MM-DD using local date methods (respects TZ env var)
function localDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Score a dish for suggestion ranking.
 *
 * Formula:
 *   score = avgRating (1-5, neutral 3 if unrated)
 *           - recencyPenalty (0-2, based on how recently prepared vs window)
 *
 * Recency penalty = 2 * max(0, 1 - daysSince / recencyWindowDays)
 * A dish prepared today gets full penalty (2), one at the window edge gets 0.
 */
export function scoreDish(
  avgRating: number | null,
  lastPreparedDate: string | null,
  recencyWindowDays: number,
  today: string = localDateStr()
): number {
  const base = avgRating ?? 3;
  if (!lastPreparedDate) return base;

  const msPerDay = 86_400_000;
  const daysSince = (new Date(today).getTime() - new Date(lastPreparedDate).getTime()) / msPerDay;
  const recencyPenalty = 2 * Math.max(0, 1 - daysSince / recencyWindowDays);
  return base - recencyPenalty;
}

/**
 * Generate human-readable reasons for why a dish is suggested.
 */
export function buildReasons(
  avgRating: number | null,
  totalRatings: number,
  lastPreparedDate: string | null,
  recencyWindowDays: number,
  today: string = localDateStr()
): string[] {
  const reasons: string[] = [];

  if (avgRating !== null && totalRatings > 0) {
    reasons.push(
      `Rated ${avgRating.toFixed(1)} ★ (${totalRatings} rating${totalRatings !== 1 ? 's' : ''})`
    );
  } else {
    reasons.push('Not yet rated');
  }

  if (!lastPreparedDate) {
    reasons.push('Never made before');
  } else {
    const msPerDay = 86_400_000;
    const daysSince = Math.floor(
      (new Date(today).getTime() - new Date(lastPreparedDate).getTime()) / msPerDay
    );
    if (daysSince === 0) {
      reasons.push('Made today');
    } else if (daysSince === 1) {
      reasons.push('Made yesterday');
    } else if (daysSince < recencyWindowDays) {
      reasons.push(`Made ${daysSince} days ago`);
    } else {
      const weeks = Math.round(daysSince / 7);
      if (weeks === 1) {
        reasons.push('Last made about a week ago');
      } else if (weeks < 8) {
        reasons.push(`Last made ${weeks} weeks ago`);
      } else {
        const months = Math.round(daysSince / 30);
        reasons.push(`Last made ${months} month${months !== 1 ? 's' : ''} ago`);
      }
    }
  }

  return reasons;
}

export async function getSuggestions(query: SuggestionsQueryInput): Promise<SuggestedDish[]> {
  const settings = await getSettings();
  const recencyWindowDays = settings.recencyWindowDays;
  const today = localDateStr();

  // Build exclude condition
  const baseConditions = [
    eq(schema.dishes.archived, false),
    inArray(schema.dishes.type, ['main', 'both']),
  ];
  if (query.exclude.length > 0) {
    baseConditions.push(notInArray(schema.dishes.id, query.exclude));
  }

  // Fetch all eligible main dishes
  const allDishes = await db
    .select()
    .from(schema.dishes)
    .where(and(...baseConditions));

  if (allDishes.length === 0) return [];

  const dishIds = allDishes.map((d) => d.id);

  // Get free-form tags for each dish
  const dishTagRows = await db
    .select({
      dishId: schema.dishTags.dishId,
      tagName: schema.tags.name,
    })
    .from(schema.dishTags)
    .innerJoin(schema.tags, eq(schema.dishTags.tagId, schema.tags.id))
    .where(inArray(schema.dishTags.dishId, dishIds));

  const tagsByDishId = new Map<string, string[]>();
  for (const row of dishTagRows) {
    const existing = tagsByDishId.get(row.dishId) ?? [];
    existing.push(row.tagName);
    tagsByDishId.set(row.dishId, existing);
  }

  // Get dietary tags for each dish
  const dietaryTagRows = await db
    .select({
      dishId: schema.dishDietaryTags.dishId,
      tag: schema.dishDietaryTags.tag,
    })
    .from(schema.dishDietaryTags)
    .where(inArray(schema.dishDietaryTags.dishId, dishIds));

  const dietaryTagsByDishId = new Map<string, string[]>();
  for (const row of dietaryTagRows) {
    const existing = dietaryTagsByDishId.get(row.dishId) ?? [];
    existing.push(row.tag);
    dietaryTagsByDishId.set(row.dishId, existing);
  }

  // Filter by free-form tag if requested
  let filteredDishes = query.tag
    ? allDishes.filter((d) => (tagsByDishId.get(d.id) ?? []).includes(query.tag!))
    : allDishes;

  // Filter by dietary tags if requested (dish must have ALL requested tags)
  if (query.dietaryTags && query.dietaryTags.length > 0) {
    filteredDishes = filteredDishes.filter((d) => {
      const dishDietaryTags = dietaryTagsByDishId.get(d.id) ?? [];
      return query.dietaryTags!.every((dt) => dishDietaryTags.includes(dt));
    });
  }

  if (filteredDishes.length === 0) return [];

  // Get avg rating + total ratings per dish (via preparations → ratings)
  const ratingStats = await db
    .select({
      dishId: schema.preparations.dishId,
      avgRating: sql<number>`ROUND(AVG(${schema.ratings.stars}), 2)`,
      totalRatings: sql<number>`COUNT(${schema.ratings.id})`,
    })
    .from(schema.preparations)
    .innerJoin(schema.ratings, eq(schema.ratings.preparationId, schema.preparations.id))
    .where(
      inArray(
        schema.preparations.dishId,
        filteredDishes.map((d) => d.id)
      )
    )
    .groupBy(schema.preparations.dishId);

  const ratingByDishId = new Map(ratingStats.map((r) => [r.dishId, r]));

  // Get most recent prepared date per dish
  const recentPreps = await db
    .select({
      dishId: schema.preparations.dishId,
      lastPreparedDate: sql<string>`MAX(${schema.preparations.preparedDate})`,
    })
    .from(schema.preparations)
    .where(
      inArray(
        schema.preparations.dishId,
        filteredDishes.map((d) => d.id)
      )
    )
    .groupBy(schema.preparations.dishId);

  const lastPrepByDishId = new Map(recentPreps.map((r) => [r.dishId, r.lastPreparedDate]));

  // Score and sort
  const scored = filteredDishes.map((dish) => {
    const stats = ratingByDishId.get(dish.id);
    const avgRating = stats ? Number(stats.avgRating) : null;
    const totalRatings = stats ? Number(stats.totalRatings) : 0;
    const lastPreparedDate = lastPrepByDishId.get(dish.id) ?? null;
    const score = scoreDish(avgRating, lastPreparedDate, recencyWindowDays, today);
    const reasons = buildReasons(
      avgRating,
      totalRatings,
      lastPreparedDate,
      recencyWindowDays,
      today
    );

    return {
      id: dish.id,
      name: dish.name,
      type: dish.type as 'main' | 'side',
      description: dish.description,
      tags: tagsByDishId.get(dish.id) ?? [],
      avgRating,
      totalRatings,
      lastPreparedDate,
      score,
      reasons,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, query.limit);
}

/**
 * Generate human-readable reasons for why a restaurant is suggested.
 */
function buildRestaurantReasons(
  avgRating: number | null,
  totalRatings: number,
  lastVisitedDate: string | null,
  today: string = localDateStr()
): string[] {
  const reasons: string[] = [];

  if (avgRating !== null && avgRating >= 4) {
    reasons.push(
      `Highly rated (${avgRating.toFixed(1)} stars from ${totalRatings} rating${totalRatings !== 1 ? 's' : ''})`
    );
  }

  if (totalRatings >= 3 && avgRating !== null && avgRating >= 4) {
    reasons.push('Family favorite');
  }

  if (!lastVisitedDate) {
    reasons.push('Never visited');
  } else {
    const msPerDay = 86_400_000;
    const daysSince = Math.floor(
      (new Date(today).getTime() - new Date(lastVisitedDate).getTime()) / msPerDay
    );
    if (daysSince > 14) {
      reasons.push(`Haven't been in ${daysSince} days`);
    }
  }

  return reasons;
}

export async function getRestaurantSuggestions(query: {
  limit?: number;
  exclude?: string[];
  cuisineType?: string;
}): Promise<SuggestedRestaurant[]> {
  const settings = await getSettings();
  const recencyWindowDays = settings.recencyWindowDays;
  const today = localDateStr();
  const limit = query.limit ?? 5;
  const exclude = query.exclude ?? [];

  // Build base conditions: non-archived restaurants
  const baseConditions = [eq(schema.restaurants.archived, false)];
  if (exclude.length > 0) {
    baseConditions.push(notInArray(schema.restaurants.id, exclude));
  }
  if (query.cuisineType) {
    baseConditions.push(eq(schema.restaurants.cuisineType, query.cuisineType));
  }

  const allRestaurants = await db
    .select()
    .from(schema.restaurants)
    .where(and(...baseConditions));

  if (allRestaurants.length === 0) return [];

  const restaurantIds = allRestaurants.map((r) => r.id);

  // Get avg rating across all restaurant_dish_ratings for dishes at each restaurant
  const ratingStats = await db
    .select({
      restaurantId: schema.restaurantDishes.restaurantId,
      avgRating: sql<number>`ROUND(AVG(${schema.restaurantDishRatings.stars}), 2)`,
      totalRatings: sql<number>`COUNT(${schema.restaurantDishRatings.id})`,
    })
    .from(schema.restaurantDishes)
    .innerJoin(
      schema.restaurantDishRatings,
      eq(schema.restaurantDishRatings.restaurantDishId, schema.restaurantDishes.id)
    )
    .where(inArray(schema.restaurantDishes.restaurantId, restaurantIds))
    .groupBy(schema.restaurantDishes.restaurantId);

  const ratingByRestaurantId = new Map(ratingStats.map((r) => [r.restaurantId, r]));

  // Get visit count and last visit date (preparations with this restaurantId)
  const visitStats = await db
    .select({
      restaurantId: schema.preparations.restaurantId,
      visitCount: sql<number>`COUNT(${schema.preparations.id})`,
      lastVisitedDate: sql<string>`MAX(${schema.preparations.preparedDate})`,
    })
    .from(schema.preparations)
    .where(inArray(schema.preparations.restaurantId, restaurantIds))
    .groupBy(schema.preparations.restaurantId);

  const visitByRestaurantId = new Map(visitStats.map((v) => [v.restaurantId as string, v]));

  // Score and sort
  const scored = allRestaurants.map((restaurant) => {
    const stats = ratingByRestaurantId.get(restaurant.id);
    const avgRating = stats ? Number(stats.avgRating) : null;
    const totalRatings = stats ? Number(stats.totalRatings) : 0;
    const visits = visitByRestaurantId.get(restaurant.id);
    const visitCount = visits ? Number(visits.visitCount) : 0;
    const lastVisitedDate = visits?.lastVisitedDate ?? null;

    const score = scoreDish(avgRating, lastVisitedDate, recencyWindowDays, today);
    const reasons = buildRestaurantReasons(avgRating, totalRatings, lastVisitedDate, today);

    return {
      id: restaurant.id,
      name: restaurant.name,
      cuisineType: restaurant.cuisineType ?? null,
      location: restaurant.location ?? null,
      averageRating: avgRating,
      totalRatings,
      visitCount,
      lastVisitedDate,
      score,
      reasons,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/**
 * Build human-readable reasons for a dish suggestion.
 */
function buildDishReasons(
  avgRating: number | null,
  ratingCount: number,
  userRatings: Array<{ displayName: string; stars: number }>
): string[] {
  const reasons: string[] = [];

  if (ratingCount === 0) {
    reasons.push('Not yet rated — try it!');
    return reasons;
  }

  if (avgRating !== null) {
    if (avgRating >= 4.5) {
      reasons.push('Top pick');
    } else if (avgRating >= 4.0) {
      reasons.push('Highly rated');
    }
  }

  if (ratingCount >= 3 && avgRating !== null && avgRating >= 4.0) {
    reasons.push('Family favorite');
  }

  // Individual user preferences for top raters
  for (const ur of userRatings) {
    if (ur.stars === 5) {
      reasons.push(`${ur.displayName} loves this (5★)`);
    } else if (ur.stars >= 4) {
      reasons.push(`${ur.displayName} likes this (${ur.stars}★)`);
    }
  }

  return reasons;
}

/**
 * Return top-rated dishes at a specific restaurant, ranked by average rating.
 * Unrated dishes appear last.
 */
export async function getDishSuggestions(
  restaurantId: string,
  query: { limit?: number }
): Promise<SuggestedRestaurantDish[]> {
  const limit = query.limit ?? 10;

  // Fetch all dishes at the restaurant
  const dishes = await db
    .select()
    .from(schema.restaurantDishes)
    .where(eq(schema.restaurantDishes.restaurantId, restaurantId));

  if (dishes.length === 0) return [];

  const dishIds = dishes.map((d) => d.id);

  // Fetch all ratings with user info for these dishes
  const ratingsRows = await db
    .select({
      id: schema.restaurantDishRatings.id,
      restaurantDishId: schema.restaurantDishRatings.restaurantDishId,
      userId: schema.restaurantDishRatings.userId,
      stars: schema.restaurantDishRatings.stars,
      note: schema.restaurantDishRatings.note,
      displayName: schema.users.displayName,
    })
    .from(schema.restaurantDishRatings)
    .innerJoin(schema.users, eq(schema.users.id, schema.restaurantDishRatings.userId))
    .where(
      dishIds.length === 1
        ? eq(schema.restaurantDishRatings.restaurantDishId, dishIds[0])
        : inArray(schema.restaurantDishRatings.restaurantDishId, dishIds)
    );

  // Group ratings by dishId
  const ratingsByDishId = new Map<string, typeof ratingsRows>();
  for (const row of ratingsRows) {
    const list = ratingsByDishId.get(row.restaurantDishId) ?? [];
    list.push(row);
    ratingsByDishId.set(row.restaurantDishId, list);
  }

  const result: SuggestedRestaurantDish[] = dishes.map((dish) => {
    const dishRatings = ratingsByDishId.get(dish.id) ?? [];
    const ratingCount = dishRatings.length;
    const avgRating =
      ratingCount > 0
        ? Math.round((dishRatings.reduce((sum, r) => sum + r.stars, 0) / ratingCount) * 100) / 100
        : null;

    const userRatings = dishRatings.map((r) => ({
      userId: r.userId,
      displayName: r.displayName,
      stars: r.stars,
      note: r.note,
    }));

    const reasons = buildDishReasons(avgRating, ratingCount, userRatings);

    return {
      id: dish.id,
      restaurantId: dish.restaurantId,
      name: dish.name,
      notes: dish.notes,
      averageRating: avgRating,
      ratingCount,
      userRatings,
      reasons,
    };
  });

  // Sort: rated dishes by avgRating desc, unrated last
  result.sort((a, b) => {
    if (a.averageRating === null && b.averageRating === null) return 0;
    if (a.averageRating === null) return 1;
    if (b.averageRating === null) return -1;
    return b.averageRating - a.averageRating;
  });

  return result.slice(0, limit);
}
