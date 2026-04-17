import crypto from 'crypto';
import { eq, and, like, desc, asc, sql, isNotNull } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type {
  CreateRestaurantInput,
  UpdateRestaurantInput,
  RestaurantQueryInput,
} from '@dinner-planner/shared';

export interface RestaurantResponse {
  id: string;
  name: string;
  cuisineType: string | null;
  location: string | null;
  notes: string | null;
  archived: boolean;
  createdBy: { id: string; displayName: string };
  visitCount: number;
  averageRating: number | null;
  lastVisitedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RestaurantSummaryResponse {
  id: string;
  name: string;
  cuisineType: string | null;
  location: string | null;
  visitCount: number;
  averageRating: number | null;
  lastVisitedAt: string | null;
}

async function getRestaurantStats(
  restaurantId: string
): Promise<{ visitCount: number; averageRating: number | null; lastVisitedAt: string | null }> {
  // Visit count = number of preparations linked to this restaurant
  const visitRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.preparations)
    .where(eq(schema.preparations.restaurantId, restaurantId));
  const visitCount = visitRows[0]?.count ?? 0;

  // Average rating across all dish ratings for all dishes at this restaurant
  const ratingRows = await db
    .select({ avg: sql<number | null>`avg(${schema.restaurantDishRatings.stars})` })
    .from(schema.restaurantDishRatings)
    .innerJoin(
      schema.restaurantDishes,
      eq(schema.restaurantDishRatings.restaurantDishId, schema.restaurantDishes.id)
    )
    .where(eq(schema.restaurantDishes.restaurantId, restaurantId));
  const averageRating = ratingRows[0]?.avg ?? null;

  // Last visited at = most recent preparation date for this restaurant
  const lastVisitRows = await db
    .select({ preparedDate: schema.preparations.preparedDate })
    .from(schema.preparations)
    .where(
      and(
        eq(schema.preparations.restaurantId, restaurantId),
        isNotNull(schema.preparations.restaurantId)
      )
    )
    .orderBy(desc(schema.preparations.preparedDate))
    .limit(1);
  const lastVisitedAt = lastVisitRows[0]?.preparedDate ?? null;

  return { visitCount, averageRating, lastVisitedAt };
}

async function buildRestaurantResponse(
  restaurant: typeof schema.restaurants.$inferSelect
): Promise<RestaurantResponse> {
  const creator = await db.query.users.findFirst({
    where: eq(schema.users.id, restaurant.createdById),
  });

  const stats = await getRestaurantStats(restaurant.id);

  return {
    id: restaurant.id,
    name: restaurant.name,
    cuisineType: restaurant.cuisineType,
    location: restaurant.location,
    notes: restaurant.notes,
    archived: restaurant.archived,
    createdBy: {
      id: restaurant.createdById,
      displayName: creator?.displayName ?? 'Unknown',
    },
    ...stats,
    createdAt: restaurant.createdAt,
    updatedAt: restaurant.updatedAt,
  };
}

/**
 * List restaurants with filtering and pagination
 */
export async function listRestaurants(
  query: RestaurantQueryInput
): Promise<{ restaurants: RestaurantResponse[]; total: number }> {
  const conditions = [eq(schema.restaurants.archived, query.archived)];

  if (query.search) {
    const searchPattern = `%${query.search}%`;
    conditions.push(like(schema.restaurants.name, searchPattern));
  }

  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.restaurants)
    .where(and(...conditions));
  const total = countResult[0]?.count ?? 0;

  let orderClause;
  switch (query.sort) {
    case 'name':
      orderClause =
        query.order === 'desc' ? desc(schema.restaurants.name) : asc(schema.restaurants.name);
      break;
    case 'created':
      orderClause =
        query.order === 'desc'
          ? desc(schema.restaurants.createdAt)
          : asc(schema.restaurants.createdAt);
      break;
    case 'recent':
    case 'rating':
    default:
      orderClause = asc(schema.restaurants.name);
  }

  const rows = await db
    .select()
    .from(schema.restaurants)
    .where(and(...conditions))
    .orderBy(orderClause)
    .limit(query.limit)
    .offset(query.offset);

  const restaurants = await Promise.all(rows.map((r) => buildRestaurantResponse(r)));
  return { restaurants, total };
}

/**
 * Get restaurant by ID
 */
export async function getRestaurantById(id: string): Promise<RestaurantResponse | null> {
  const restaurant = await db.query.restaurants.findFirst({
    where: eq(schema.restaurants.id, id),
  });
  if (!restaurant) return null;
  return buildRestaurantResponse(restaurant);
}

/**
 * Create a new restaurant
 */
export async function createRestaurant(
  input: CreateRestaurantInput,
  userId: string
): Promise<RestaurantResponse> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.restaurants).values({
    id,
    name: input.name,
    cuisineType: input.cuisineType,
    location: input.location,
    notes: input.notes,
    archived: false,
    createdById: userId,
    createdAt: now,
    updatedAt: now,
  });

  return (await getRestaurantById(id))!;
}

/**
 * Update a restaurant
 */
export async function updateRestaurant(
  id: string,
  input: UpdateRestaurantInput
): Promise<RestaurantResponse | null> {
  const restaurant = await db.query.restaurants.findFirst({
    where: eq(schema.restaurants.id, id),
  });
  if (!restaurant) return null;

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { updatedAt: now };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.cuisineType !== undefined) updateData.cuisineType = input.cuisineType;
  if (input.location !== undefined) updateData.location = input.location;
  if (input.notes !== undefined) updateData.notes = input.notes;
  if (input.archived !== undefined) updateData.archived = input.archived;

  await db.update(schema.restaurants).set(updateData).where(eq(schema.restaurants.id, id));

  return getRestaurantById(id);
}

/**
 * Delete a restaurant (hard delete)
 */
export async function deleteRestaurant(id: string): Promise<{ success: boolean; error?: string }> {
  const restaurant = await db.query.restaurants.findFirst({
    where: eq(schema.restaurants.id, id),
  });
  if (!restaurant) {
    return { success: false, error: 'Restaurant not found' };
  }

  // Nullify FK references in dinner_entries before deleting
  await db
    .update(schema.dinnerEntries)
    .set({ restaurantId: null })
    .where(eq(schema.dinnerEntries.restaurantId, id));

  // Nullify FK references in preparations before deleting
  await db
    .update(schema.preparations)
    .set({ restaurantId: null })
    .where(eq(schema.preparations.restaurantId, id));

  // Delete the restaurant — restaurant_dishes and restaurant_dish_ratings cascade
  await db.delete(schema.restaurants).where(eq(schema.restaurants.id, id));

  return { success: true };
}
