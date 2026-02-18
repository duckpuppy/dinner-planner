import { eq, and, notInArray, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { SuggestionsQueryInput, SuggestedDish } from '@dinner-planner/shared';
import { getSettings } from './settings.js';

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
  today: string = new Date().toISOString().slice(0, 10)
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
  today: string = new Date().toISOString().slice(0, 10)
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
  const today = new Date().toISOString().slice(0, 10);

  // Build exclude condition
  const baseConditions = [eq(schema.dishes.archived, false), eq(schema.dishes.type, 'main')];
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

  // Get tags for each dish
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

  // Filter by tag if requested (after fetching to reuse tag data)
  const filteredDishes = query.tag
    ? allDishes.filter((d) => (tagsByDishId.get(d.id) ?? []).includes(query.tag!))
    : allDishes;

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
