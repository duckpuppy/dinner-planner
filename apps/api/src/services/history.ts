import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';


export interface HistoryEntry {
  id: string;
  date: string;
  type: 'assembled' | 'fend_for_self' | 'dining_out' | 'custom';
  customText: string | null;
  completed: boolean;
  mainDish: {
    id: string;
    name: string;
  } | null;
  sideDishes: {
    id: string;
    name: string;
  }[];
  preparations: {
    id: string;
    preparers: { id: string; name: string }[];
    notes: string | null;
    ratings: {
      id: string;
      stars: number;
      userName: string;
    }[];
  }[];
}

export interface HistoryQueryParams {
  startDate?: string;
  endDate?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Get meal history with optional filtering
 */
export async function getHistory(params: HistoryQueryParams): Promise<{
  entries: HistoryEntry[];
  total: number;
}> {
  const { startDate, endDate, search, limit = 50, offset = 0 } = params;

  // Build conditions
  const conditions = [];

  // Only include completed entries or entries with preparations
  conditions.push(eq(schema.dinnerEntries.completed, true));

  if (startDate) {
    conditions.push(gte(schema.dinnerEntries.date, startDate));
  }

  if (endDate) {
    conditions.push(lte(schema.dinnerEntries.date, endDate));
  }

  // Get all matching entries
  let entries = await db
    .select()
    .from(schema.dinnerEntries)
    .where(and(...conditions))
    .orderBy(desc(schema.dinnerEntries.date))
    .limit(limit)
    .offset(offset);

  // If searching, filter by dish name
  if (search) {
    const searchLower = search.toLowerCase();
    const filteredEntries = [];

    for (const entry of entries) {
      // Check main dish name
      if (entry.mainDishId) {
        const dish = await db.query.dishes.findFirst({
          where: eq(schema.dishes.id, entry.mainDishId),
        });
        if (dish && dish.name.toLowerCase().includes(searchLower)) {
          filteredEntries.push(entry);
          continue;
        }
      }

      // Check custom text
      if (entry.customText && entry.customText.toLowerCase().includes(searchLower)) {
        filteredEntries.push(entry);
      }
    }

    entries = filteredEntries;
  }

  // Get total count (simplified - just use entries length for now)
  const total = entries.length;

  // Enrich entries with related data
  const enrichedEntries: HistoryEntry[] = [];

  for (const entry of entries) {
    // Get main dish
    let mainDish = null;
    if (entry.mainDishId) {
      const dish = await db.query.dishes.findFirst({
        where: eq(schema.dishes.id, entry.mainDishId),
      });
      if (dish) {
        mainDish = { id: dish.id, name: dish.name };
      }
    }

    // Get side dishes
    const sideDishLinks = await db
      .select()
      .from(schema.entrySideDishes)
      .where(eq(schema.entrySideDishes.entryId, entry.id));

    const sideDishes = [];
    for (const link of sideDishLinks) {
      const dish = await db.query.dishes.findFirst({
        where: eq(schema.dishes.id, link.dishId),
      });
      if (dish) {
        sideDishes.push({ id: dish.id, name: dish.name });
      }
    }

    // Get preparations with ratings
    const preps = await db
      .select()
      .from(schema.preparations)
      .where(eq(schema.preparations.dinnerEntryId, entry.id));

    const preparations = [];
    for (const prep of preps) {
      // Get preparers from join table
      const preparerLinks = await db
        .select()
        .from(schema.preparationPreparers)
        .where(eq(schema.preparationPreparers.preparationId, prep.id));
      const preparers: { id: string; name: string }[] = [];
      for (const link of preparerLinks) {
        const user = await db.query.users.findFirst({
          where: eq(schema.users.id, link.userId),
        });
        preparers.push({ id: link.userId, name: user?.displayName ?? 'Unknown' });
      }

      // Get ratings for this preparation
      const ratings = await db
        .select()
        .from(schema.ratings)
        .where(eq(schema.ratings.preparationId, prep.id));

      const enrichedRatings = [];
      for (const rating of ratings) {
        const ratingUser = await db.query.users.findFirst({
          where: eq(schema.users.id, rating.userId),
        });
        enrichedRatings.push({
          id: rating.id,
          stars: rating.stars,
          userName: ratingUser?.displayName ?? 'Unknown',
        });
      }

      preparations.push({
        id: prep.id,
        preparers,
        notes: prep.notes,
        ratings: enrichedRatings,
      });
    }

    enrichedEntries.push({
      id: entry.id,
      date: entry.date,
      type: entry.type,
      customText: entry.customText,
      completed: entry.completed,
      mainDish,
      sideDishes,
      preparations,
    });
  }

  return { entries: enrichedEntries, total };
}

/**
 * Get preparation history for a specific dish
 */
export async function getDishHistory(dishId: string): Promise<{
  preparations: {
    id: string;
    date: string;
    preparers: { id: string; name: string }[];
    notes: string | null;
    ratings: {
      id: string;
      stars: number;
      note: string | null;
      userName: string;
    }[];
  }[];
}> {
  const preps = await db
    .select()
    .from(schema.preparations)
    .where(eq(schema.preparations.dishId, dishId))
    .orderBy(desc(schema.preparations.preparedDate));

  const preparations = [];

  for (const prep of preps) {
    // Get preparers from join table
    const preparerLinks = await db
      .select()
      .from(schema.preparationPreparers)
      .where(eq(schema.preparationPreparers.preparationId, prep.id));
    const preparers: { id: string; name: string }[] = [];
    for (const link of preparerLinks) {
      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, link.userId),
      });
      preparers.push({ id: link.userId, name: user?.displayName ?? 'Unknown' });
    }

    const ratings = await db
      .select()
      .from(schema.ratings)
      .where(eq(schema.ratings.preparationId, prep.id));

    const enrichedRatings = [];
    for (const rating of ratings) {
      const ratingUser = await db.query.users.findFirst({
        where: eq(schema.users.id, rating.userId),
      });
      enrichedRatings.push({
        id: rating.id,
        stars: rating.stars,
        note: rating.note,
        userName: ratingUser?.displayName ?? 'Unknown',
      });
    }

    preparations.push({
      id: prep.id,
      date: prep.preparedDate,
      preparers,
      notes: prep.notes,
      ratings: enrichedRatings,
    });
  }

  return { preparations };
}

/**
 * Delete a history entry (dinner entry) and all related data
 */
export async function deleteHistoryEntry(entryId: string): Promise<{ success: boolean }> {
  // Get all preparations for this entry
  const preps = await db
    .select()
    .from(schema.preparations)
    .where(eq(schema.preparations.dinnerEntryId, entryId));

  // Delete all ratings for each preparation
  for (const prep of preps) {
    await db.delete(schema.ratings).where(eq(schema.ratings.preparationId, prep.id));
  }

  // Delete all preparations
  await db.delete(schema.preparations).where(eq(schema.preparations.dinnerEntryId, entryId));

  // Delete side dish links
  await db.delete(schema.entrySideDishes).where(eq(schema.entrySideDishes.entryId, entryId));

  // Delete the entry itself
  await db.delete(schema.dinnerEntries).where(eq(schema.dinnerEntries.id, entryId));

  return { success: true };
}
