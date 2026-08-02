import crypto from 'crypto';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { CreateRatingInput, UpdateRatingInput } from '@dinner-planner/shared';

/**
 * Resolve the family a preparation belongs to, via its dinner entry's menu.
 * Returns null if the preparation doesn't exist.
 */
async function preparationFamilyId(preparationId: string): Promise<string | null> {
  const row = await db
    .select({ familyId: schema.weeklyMenus.familyId })
    .from(schema.preparations)
    .innerJoin(schema.dinnerEntries, eq(schema.preparations.dinnerEntryId, schema.dinnerEntries.id))
    .innerJoin(schema.weeklyMenus, eq(schema.dinnerEntries.menuId, schema.weeklyMenus.id))
    .where(eq(schema.preparations.id, preparationId))
    .limit(1);
  return row[0]?.familyId ?? null;
}

export interface RatingResponse {
  id: string;
  preparationId: string;
  userId: string;
  userName: string;
  stars: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DishRatingStats {
  averageRating: number | null;
  totalRatings: number;
}

async function toRatingResponse(
  rating: typeof schema.ratings.$inferSelect
): Promise<RatingResponse> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, rating.userId),
  });

  return {
    id: rating.id,
    preparationId: rating.preparationId,
    userId: rating.userId,
    userName: user?.displayName ?? 'Unknown',
    stars: rating.stars,
    note: rating.note,
    createdAt: rating.createdAt,
    updatedAt: rating.updatedAt,
  };
}

/**
 * Get all ratings for a preparation, scoped to a family. Returns an empty
 * array if the preparation doesn't exist or belongs to another family.
 */
export async function getRatingsForPreparation(
  preparationId: string,
  familyId: string
): Promise<RatingResponse[]> {
  if ((await preparationFamilyId(preparationId)) !== familyId) return [];

  const ratings = await db
    .select()
    .from(schema.ratings)
    .where(eq(schema.ratings.preparationId, preparationId))
    .orderBy(desc(schema.ratings.createdAt));

  return Promise.all(ratings.map(toRatingResponse));
}

/**
 * Get a user's rating for a preparation
 */
export async function getUserRatingForPreparation(
  preparationId: string,
  userId: string
): Promise<RatingResponse | null> {
  const rating = await db.query.ratings.findFirst({
    where: and(eq(schema.ratings.preparationId, preparationId), eq(schema.ratings.userId, userId)),
  });

  return rating ? toRatingResponse(rating) : null;
}

/**
 * Create a rating for a preparation, scoped to a family
 */
export async function createRating(
  preparationId: string,
  userId: string,
  input: CreateRatingInput,
  familyId: string
): Promise<RatingResponse> {
  // Verify preparation exists and belongs to the requesting family
  if ((await preparationFamilyId(preparationId)) !== familyId) {
    throw new Error('Preparation not found');
  }

  // Check if user already rated this preparation
  const existing = await db.query.ratings.findFirst({
    where: and(eq(schema.ratings.preparationId, preparationId), eq(schema.ratings.userId, userId)),
  });

  if (existing) {
    throw new Error('You have already rated this preparation');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.ratings).values({
    id,
    preparationId,
    userId,
    stars: input.stars,
    note: input.note ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const rating = await db.query.ratings.findFirst({
    where: eq(schema.ratings.id, id),
  });

  return toRatingResponse(rating!);
}

/**
 * Update a rating, scoped to a family
 */
export async function updateRating(
  ratingId: string,
  userId: string,
  input: UpdateRatingInput,
  familyId: string
): Promise<RatingResponse | null> {
  const rating = await db.query.ratings.findFirst({
    where: eq(schema.ratings.id, ratingId),
  });

  if (!rating) {
    return null;
  }

  if ((await preparationFamilyId(rating.preparationId)) !== familyId) {
    return null;
  }

  // Only the owner can update their rating
  if (rating.userId !== userId) {
    throw new Error('You can only edit your own ratings');
  }

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { updatedAt: now };

  if (input.stars !== undefined) updateData.stars = input.stars;
  if (input.note !== undefined) updateData.note = input.note;

  await db.update(schema.ratings).set(updateData).where(eq(schema.ratings.id, ratingId));

  const updated = await db.query.ratings.findFirst({
    where: eq(schema.ratings.id, ratingId),
  });

  return toRatingResponse(updated!);
}

/**
 * Delete a rating, scoped to a family
 */
export async function deleteRating(
  ratingId: string,
  userId: string,
  isAdmin: boolean,
  familyId: string
): Promise<{ success: boolean; error?: string }> {
  const rating = await db.query.ratings.findFirst({
    where: eq(schema.ratings.id, ratingId),
  });

  if (!rating || (await preparationFamilyId(rating.preparationId)) !== familyId) {
    return { success: false, error: 'Rating not found' };
  }

  // Only the owner or admin can delete
  if (rating.userId !== userId && !isAdmin) {
    return { success: false, error: 'You can only delete your own ratings' };
  }

  await db.delete(schema.ratings).where(eq(schema.ratings.id, ratingId));

  return { success: true };
}

/**
 * Get aggregate rating stats for a dish, scoped to a family. Returns zeroed
 * stats if the dish doesn't exist or belongs to another family.
 */
export async function getDishRatingStats(
  dishId: string,
  familyId: string
): Promise<DishRatingStats> {
  const dish = await db.query.dishes.findFirst({
    where: and(eq(schema.dishes.id, dishId), eq(schema.dishes.familyId, familyId)),
  });
  if (!dish) {
    return { averageRating: null, totalRatings: 0 };
  }

  // Get all preparations for this dish
  const preparations = await db
    .select({ id: schema.preparations.id })
    .from(schema.preparations)
    .where(eq(schema.preparations.dishId, dishId));

  if (preparations.length === 0) {
    return { averageRating: null, totalRatings: 0 };
  }

  const prepIds = preparations.map((p) => p.id);

  // For multiple preparations, we need to query each
  let allRatings: { stars: number }[] = [];
  for (const prepId of prepIds) {
    const prepRatings = await db
      .select({ stars: schema.ratings.stars })
      .from(schema.ratings)
      .where(eq(schema.ratings.preparationId, prepId));
    allRatings = [...allRatings, ...prepRatings];
  }

  if (allRatings.length === 0) {
    return { averageRating: null, totalRatings: 0 };
  }

  const totalStars = allRatings.reduce((sum, r) => sum + r.stars, 0);
  const averageRating = Math.round((totalStars / allRatings.length) * 10) / 10;

  return {
    averageRating,
    totalRatings: allRatings.length,
  };
}

/**
 * Get ratings stats for multiple dishes at once
 */
export async function getDishesRatingStats(
  dishIds: string[],
  familyId: string
): Promise<Map<string, DishRatingStats>> {
  const statsMap = new Map<string, DishRatingStats>();

  // Initialize all dishes with no ratings
  for (const dishId of dishIds) {
    statsMap.set(dishId, { averageRating: null, totalRatings: 0 });
  }

  // Get all preparations for these dishes
  for (const dishId of dishIds) {
    const stats = await getDishRatingStats(dishId, familyId);
    statsMap.set(dishId, stats);
  }

  return statsMap;
}
