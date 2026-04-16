import crypto from 'crypto';
import { eq, and, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type {
  CreateRestaurantDishInput,
  UpdateRestaurantDishInput,
  CreateRestaurantDishRatingInput,
  UpdateRestaurantDishRatingInput,
} from '@dinner-planner/shared';

export interface RestaurantDishResponse {
  id: string;
  restaurantId: string;
  name: string;
  notes: string | null;
  averageRating: number | null;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RestaurantDishRatingResponse {
  id: string;
  restaurantDishId: string;
  user: { id: string; displayName: string };
  stars: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

async function buildDishResponse(
  dish: typeof schema.restaurantDishes.$inferSelect
): Promise<RestaurantDishResponse> {
  const ratingRows = await db
    .select({
      avg: sql<number | null>`avg(${schema.restaurantDishRatings.stars})`,
      count: sql<number>`count(*)`,
    })
    .from(schema.restaurantDishRatings)
    .where(eq(schema.restaurantDishRatings.restaurantDishId, dish.id));

  const avg = ratingRows[0]?.avg ?? null;
  const count = ratingRows[0]?.count ?? 0;

  return {
    id: dish.id,
    restaurantId: dish.restaurantId,
    name: dish.name,
    notes: dish.notes,
    averageRating: avg,
    ratingCount: count,
    createdAt: dish.createdAt,
    updatedAt: dish.updatedAt,
  };
}

/**
 * List all dishes for a restaurant
 */
export async function listDishesByRestaurant(
  restaurantId: string
): Promise<RestaurantDishResponse[]> {
  const dishes = await db
    .select()
    .from(schema.restaurantDishes)
    .where(eq(schema.restaurantDishes.restaurantId, restaurantId));

  return Promise.all(dishes.map((d) => buildDishResponse(d)));
}

/**
 * Create a dish at a restaurant
 */
export async function createRestaurantDish(
  restaurantId: string,
  input: CreateRestaurantDishInput
): Promise<RestaurantDishResponse> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.restaurantDishes).values({
    id,
    restaurantId,
    name: input.name,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  });

  const dish = (await db.query.restaurantDishes.findFirst({
    where: eq(schema.restaurantDishes.id, id),
  }))!;

  return buildDishResponse(dish);
}

/**
 * Update a restaurant dish
 */
export async function updateRestaurantDish(
  dishId: string,
  input: UpdateRestaurantDishInput
): Promise<RestaurantDishResponse | null> {
  const dish = await db.query.restaurantDishes.findFirst({
    where: eq(schema.restaurantDishes.id, dishId),
  });
  if (!dish) return null;

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { updatedAt: now };
  if (input.name !== undefined) updateData.name = input.name;
  if (input.notes !== undefined) updateData.notes = input.notes;

  await db
    .update(schema.restaurantDishes)
    .set(updateData)
    .where(eq(schema.restaurantDishes.id, dishId));

  const updated = (await db.query.restaurantDishes.findFirst({
    where: eq(schema.restaurantDishes.id, dishId),
  }))!;

  return buildDishResponse(updated);
}

/**
 * Delete a restaurant dish (cascades ratings)
 */
export async function deleteRestaurantDish(
  dishId: string
): Promise<{ success: boolean; error?: string }> {
  const dish = await db.query.restaurantDishes.findFirst({
    where: eq(schema.restaurantDishes.id, dishId),
  });
  if (!dish) {
    return { success: false, error: 'Dish not found' };
  }

  await db.delete(schema.restaurantDishes).where(eq(schema.restaurantDishes.id, dishId));
  return { success: true };
}

/**
 * Get all ratings for a dish
 */
export async function getDishRatings(dishId: string): Promise<RestaurantDishRatingResponse[]> {
  const ratings = await db
    .select()
    .from(schema.restaurantDishRatings)
    .where(eq(schema.restaurantDishRatings.restaurantDishId, dishId));

  const userIds = [...new Set(ratings.map((r) => r.userId))];
  const userRows =
    userIds.length > 0
      ? await db
          .select({ id: schema.users.id, displayName: schema.users.displayName })
          .from(schema.users)
          .where(
            userIds.length === 1
              ? eq(schema.users.id, userIds[0])
              : sql`${schema.users.id} IN (${sql.join(
                  userIds.map((id) => sql`${id}`),
                  sql`, `
                )})`
          )
      : [];

  const userMap = new Map(userRows.map((u) => [u.id, u.displayName]));

  return ratings.map((r) => ({
    id: r.id,
    restaurantDishId: r.restaurantDishId,
    user: { id: r.userId, displayName: userMap.get(r.userId) ?? 'Unknown' },
    stars: r.stars,
    note: r.note,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

/**
 * Add or upsert a rating for a dish (one rating per user per dish)
 */
export async function addDishRating(
  dishId: string,
  userId: string,
  input: CreateRestaurantDishRatingInput
): Promise<RestaurantDishRatingResponse> {
  const now = new Date().toISOString();

  // Check for existing rating by this user on this dish
  const existing = await db.query.restaurantDishRatings.findFirst({
    where: and(
      eq(schema.restaurantDishRatings.restaurantDishId, dishId),
      eq(schema.restaurantDishRatings.userId, userId)
    ),
  });

  if (existing) {
    // Upsert: update existing rating
    await db
      .update(schema.restaurantDishRatings)
      .set({ stars: input.stars, note: input.note, updatedAt: now })
      .where(eq(schema.restaurantDishRatings.id, existing.id));

    const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
    return {
      id: existing.id,
      restaurantDishId: dishId,
      user: { id: userId, displayName: user?.displayName ?? 'Unknown' },
      stars: input.stars,
      note: input.note,
      createdAt: existing.createdAt,
      updatedAt: now,
    };
  }

  const id = crypto.randomUUID();
  await db.insert(schema.restaurantDishRatings).values({
    id,
    restaurantDishId: dishId,
    userId,
    stars: input.stars,
    note: input.note,
    createdAt: now,
    updatedAt: now,
  });

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  return {
    id,
    restaurantDishId: dishId,
    user: { id: userId, displayName: user?.displayName ?? 'Unknown' },
    stars: input.stars,
    note: input.note,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Update an existing rating
 */
export async function updateDishRating(
  ratingId: string,
  input: UpdateRestaurantDishRatingInput
): Promise<RestaurantDishRatingResponse | null> {
  const rating = await db.query.restaurantDishRatings.findFirst({
    where: eq(schema.restaurantDishRatings.id, ratingId),
  });
  if (!rating) return null;

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { updatedAt: now };
  if (input.stars !== undefined) updateData.stars = input.stars;
  if (input.note !== undefined) updateData.note = input.note;

  await db
    .update(schema.restaurantDishRatings)
    .set(updateData)
    .where(eq(schema.restaurantDishRatings.id, ratingId));

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, rating.userId) });
  const updated = (await db.query.restaurantDishRatings.findFirst({
    where: eq(schema.restaurantDishRatings.id, ratingId),
  }))!;

  return {
    id: updated.id,
    restaurantDishId: updated.restaurantDishId,
    user: { id: rating.userId, displayName: user?.displayName ?? 'Unknown' },
    stars: updated.stars,
    note: updated.note,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
}
