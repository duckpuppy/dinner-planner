import crypto from 'crypto';
import { eq, inArray, desc, and, gte, isNotNull, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { UpdateDinnerEntryInput, CreatePreparationInput } from '@dinner-planner/shared';

// Helper to get the week start date (based on app settings)
export async function getWeekStartDay(): Promise<number> {
  const settings = await db.query.appSettings.findFirst({
    where: eq(schema.appSettings.id, 'default'),
  });
  return settings?.weekStartDay ?? 0; // Default to Sunday
}

// Calculate the start date of the week containing a given date
export function getWeekStartDate(date: Date, weekStartDay: number): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day - weekStartDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Format date as YYYY-MM-DD using local date methods (respects TZ env var)
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Parse YYYY-MM-DD string to Date
export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Batch-fetch preparers for multiple preparation IDs (avoids N+1)
async function fetchPreparersMap(
  prepIds: string[]
): Promise<Map<string, { id: string; name: string }[]>> {
  if (prepIds.length === 0) return new Map();

  const links = await db
    .select()
    .from(schema.preparationPreparers)
    .where(inArray(schema.preparationPreparers.preparationId, prepIds));

  const result = new Map<string, { id: string; name: string }[]>(prepIds.map((id) => [id, []]));

  if (links.length === 0) return result;

  const userIds = [...new Set(links.map((l) => l.userId))];
  const userRows = await db.select().from(schema.users).where(inArray(schema.users.id, userIds));

  const userMap = new Map(userRows.map((u) => [u.id, u.displayName]));

  for (const link of links) {
    result.get(link.preparationId)!.push({
      id: link.userId,
      name: userMap.get(link.userId) ?? 'Unknown',
    });
  }

  return result;
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

export interface DinnerEntryResponse {
  id: string;
  date: string;
  dayOfWeek: number;
  type: 'assembled' | 'fend_for_self' | 'dining_out' | 'custom' | 'leftovers';
  customText: string | null;
  customSideText: string | null;
  restaurantName: string | null;
  restaurantNotes: string | null;
  restaurantId: string | null;
  restaurant: RestaurantSummaryResponse | null;
  completed: boolean;
  skipped: boolean;
  scale: number;
  sideScale: number;
  mainDish: {
    id: string;
    name: string;
    type: 'main' | 'side' | 'both';
  } | null;
  sideDishes: {
    id: string;
    name: string;
    type: 'main' | 'side' | 'both';
  }[];
  preparations: PreparationResponse[];
  sourceEntryId: string | null;
  sourceEntryDishName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PreparationResponse {
  id: string;
  dishId: string | null;
  dishName: string | null;
  restaurantId: string | null;
  preparers: { id: string; name: string }[];
  preparedDate: string;
  notes: string | null;
  createdAt: string;
}

export interface WeeklyMenuResponse {
  id: string;
  weekStartDate: string;
  entries: DinnerEntryResponse[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Resolve the family a dinner entry belongs to, via its parent weekly menu.
 * Returns null if the entry doesn't exist.
 */
async function entryFamilyId(entryId: string): Promise<string | null> {
  const row = await db
    .select({ familyId: schema.weeklyMenus.familyId })
    .from(schema.dinnerEntries)
    .innerJoin(schema.weeklyMenus, eq(schema.dinnerEntries.menuId, schema.weeklyMenus.id))
    .where(eq(schema.dinnerEntries.id, entryId))
    .limit(1);
  return row[0]?.familyId ?? null;
}

async function getEntryWithRelations(entryId: string): Promise<DinnerEntryResponse | null> {
  const entry = await db.query.dinnerEntries.findFirst({
    where: eq(schema.dinnerEntries.id, entryId),
  });

  if (!entry) return null;

  // Get main dish
  let mainDish = null;
  if (entry.mainDishId) {
    const dish = await db.query.dishes.findFirst({
      where: eq(schema.dishes.id, entry.mainDishId),
    });
    if (dish) {
      mainDish = { id: dish.id, name: dish.name, type: dish.type };
    }
  }

  // Get side dishes
  const sideDishLinks = await db
    .select()
    .from(schema.entrySideDishes)
    .where(eq(schema.entrySideDishes.entryId, entryId));

  const sideDishes = await Promise.all(
    sideDishLinks.map(async (link) => {
      const dish = await db.query.dishes.findFirst({
        where: eq(schema.dishes.id, link.dishId),
      });
      return dish ? { id: dish.id, name: dish.name, type: dish.type } : null;
    })
  );

  // Get preparations
  const preps = await db
    .select()
    .from(schema.preparations)
    .where(eq(schema.preparations.dinnerEntryId, entryId));

  const preparersMap = await fetchPreparersMap(preps.map((p) => p.id));

  const preparations = await Promise.all(
    preps.map(async (prep) => {
      const dish = prep.dishId
        ? await db.query.dishes.findFirst({
            where: eq(schema.dishes.id, prep.dishId),
          })
        : null;
      return {
        id: prep.id,
        dishId: prep.dishId,
        dishName: dish?.name ?? null,
        restaurantId: prep.restaurantId,
        preparers: preparersMap.get(prep.id) ?? [],
        preparedDate: prep.preparedDate,
        notes: prep.notes,
        createdAt: prep.createdAt,
      };
    })
  );

  // Get source entry dish name (for leftovers type) — single join query
  let sourceEntryDishName: string | null = null;
  if (entry.sourceEntryId) {
    const rows = await db
      .select({ dishName: schema.dishes.name })
      .from(schema.dinnerEntries)
      .leftJoin(schema.dishes, eq(schema.dishes.id, schema.dinnerEntries.mainDishId))
      .where(eq(schema.dinnerEntries.id, entry.sourceEntryId))
      .limit(1);
    sourceEntryDishName = rows[0]?.dishName ?? null;
  }

  // Get linked restaurant summary
  const restaurantId: string | null = entry.restaurantId;
  let restaurant: RestaurantSummaryResponse | null = null;
  if (entry.restaurantId) {
    const restaurantRow = await db.query.restaurants.findFirst({
      where: eq(schema.restaurants.id, entry.restaurantId),
    });
    if (restaurantRow) {
      // Visit count for this restaurant
      const visitRows = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.preparations)
        .where(eq(schema.preparations.restaurantId, restaurantRow.id));
      const visitCount = visitRows[0]?.count ?? 0;

      // Average rating
      const ratingRows = await db
        .select({ avg: sql<number | null>`avg(${schema.restaurantDishRatings.stars})` })
        .from(schema.restaurantDishRatings)
        .innerJoin(
          schema.restaurantDishes,
          eq(schema.restaurantDishRatings.restaurantDishId, schema.restaurantDishes.id)
        )
        .where(eq(schema.restaurantDishes.restaurantId, restaurantRow.id));
      const averageRating = ratingRows[0]?.avg ?? null;

      // Last visited
      const lastVisitRows = await db
        .select({ preparedDate: schema.preparations.preparedDate })
        .from(schema.preparations)
        .where(eq(schema.preparations.restaurantId, restaurantRow.id))
        .orderBy(desc(schema.preparations.preparedDate))
        .limit(1);
      const lastVisitedAt = lastVisitRows[0]?.preparedDate ?? null;

      restaurant = {
        id: restaurantRow.id,
        name: restaurantRow.name,
        cuisineType: restaurantRow.cuisineType,
        location: restaurantRow.location,
        visitCount,
        averageRating,
        lastVisitedAt,
      };
    }
  }

  const entryDate = parseDate(entry.date);

  return {
    id: entry.id,
    date: entry.date,
    dayOfWeek: entryDate.getDay(),
    type: entry.type,
    customText: entry.customText,
    customSideText: entry.customSideText ?? null,
    restaurantName: entry.restaurantName,
    restaurantNotes: entry.restaurantNotes,
    restaurantId,
    restaurant,
    completed: entry.completed,
    skipped: entry.skipped,
    scale: entry.scale,
    sideScale: entry.sideScale,
    mainDish,
    sideDishes: sideDishes.filter((d): d is NonNullable<typeof d> => d !== null),
    preparations,
    sourceEntryId: entry.sourceEntryId,
    sourceEntryDishName,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

/**
 * Find or create the family's menu for the week starting at `weekStart` and
 * guarantee it holds exactly one entry for each of its 7 dates.
 *
 * Entries are unique per (family_id, date) across ALL of a family's menus. When
 * the "week starts on" setting changes, the new week overlaps entries owned by
 * a menu with the old alignment; those entries are re-parented here (their
 * sides, prep tasks and preparations hang off the entry id and travel with it)
 * instead of being duplicated, and only the missing dates are inserted. Menus
 * left without entries are deleted. Runs on every call, not just creation, so
 * weeks whose entries were left behind in an overlapping menu (e.g. by the
 * 0036 dedupe migration) heal themselves. One synchronous transaction, so
 * concurrent requests cannot interleave.
 *
 * Note: grocery_checks are keyed by week_date, so check state saved under the
 * old week's key is orphaned after a start-day change (intentionally not
 * migrated).
 */
function ensureWeekMenu(familyId: string, weekStart: Date, weekStartStr: string) {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    dates.push(formatDate(d));
  }

  return db.transaction((tx) => {
    const now = new Date().toISOString();

    let menu = tx
      .select()
      .from(schema.weeklyMenus)
      .where(
        and(
          eq(schema.weeklyMenus.weekStartDate, weekStartStr),
          eq(schema.weeklyMenus.familyId, familyId)
        )
      )
      .get();

    if (!menu) {
      menu = {
        id: crypto.randomUUID(),
        familyId,
        weekStartDate: weekStartStr,
        createdAt: now,
        updatedAt: now,
      };
      tx.insert(schema.weeklyMenus).values(menu).run();
    }
    const menuId = menu.id;

    const existing = tx
      .select({
        id: schema.dinnerEntries.id,
        menuId: schema.dinnerEntries.menuId,
        date: schema.dinnerEntries.date,
      })
      .from(schema.dinnerEntries)
      .where(
        and(eq(schema.dinnerEntries.familyId, familyId), inArray(schema.dinnerEntries.date, dates))
      )
      .all();
    const byDate = new Map(existing.map((e) => [e.date, e]));

    const oldMenuIds = new Set<string>();
    for (const date of dates) {
      const found = byDate.get(date);
      if (!found) {
        tx.insert(schema.dinnerEntries)
          .values({
            id: crypto.randomUUID(),
            menuId,
            familyId,
            date,
            type: 'assembled',
            completed: false,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      } else if (found.menuId !== menuId) {
        tx.update(schema.dinnerEntries)
          .set({ menuId })
          .where(eq(schema.dinnerEntries.id, found.id))
          .run();
        oldMenuIds.add(found.menuId);
      }
    }

    for (const oldMenuId of oldMenuIds) {
      const remaining = tx
        .select({ id: schema.dinnerEntries.id })
        .from(schema.dinnerEntries)
        .where(eq(schema.dinnerEntries.menuId, oldMenuId))
        .limit(1)
        .all();
      if (remaining.length === 0) {
        tx.delete(schema.weeklyMenus).where(eq(schema.weeklyMenus.id, oldMenuId)).run();
      }
    }

    return menu;
  });
}

/**
 * Get or create a weekly menu for a given date
 */
export async function getOrCreateWeekMenu(
  dateStr: string,
  familyId: string
): Promise<WeeklyMenuResponse> {
  const weekStartDay = await getWeekStartDay();
  const date = parseDate(dateStr);
  const weekStart = getWeekStartDate(date, weekStartDay);
  const weekStartStr = formatDate(weekStart);

  const menu = ensureWeekMenu(familyId, weekStart, weekStartStr);

  // Get entries
  const entries = await db
    .select()
    .from(schema.dinnerEntries)
    .where(eq(schema.dinnerEntries.menuId, menu.id));

  const entriesWithRelations = await Promise.all(
    entries.map(async (entry) => (await getEntryWithRelations(entry.id))!)
  );

  // Sort by date
  entriesWithRelations.sort((a, b) => a.date.localeCompare(b.date));

  return {
    id: menu.id,
    weekStartDate: menu.weekStartDate,
    entries: entriesWithRelations,
    createdAt: menu.createdAt,
    updatedAt: menu.updatedAt,
  };
}

/**
 * Get today's dinner entry, scoped to a family
 */
export async function getTodayEntry(familyId: string): Promise<DinnerEntryResponse | null> {
  const today = formatDate(new Date());

  // Make sure the current week exists and is fully populated (re-parenting any
  // overlapping entries), then look the day up by (family, date). That pair is
  // unique, so there is exactly one candidate; the ORDER BY is only a safety
  // net so a stray duplicate could never mask a planned entry.
  await getOrCreateWeekMenu(today, familyId);

  const entry = await db
    .select({ id: schema.dinnerEntries.id })
    .from(schema.dinnerEntries)
    .where(and(eq(schema.dinnerEntries.date, today), eq(schema.dinnerEntries.familyId, familyId)))
    .orderBy(
      desc(
        sql`(${schema.dinnerEntries.type} != 'assembled' OR ${schema.dinnerEntries.mainDishId} IS NOT NULL OR ${schema.dinnerEntries.customText} IS NOT NULL)`
      ),
      desc(schema.dinnerEntries.updatedAt)
    )
    .limit(1);

  return entry.length > 0 ? getEntryWithRelations(entry[0].id) : null;
}

/**
 * Update a dinner entry
 */
export async function updateDinnerEntry(
  entryId: string,
  input: UpdateDinnerEntryInput,
  familyId: string
): Promise<DinnerEntryResponse | null> {
  if ((await entryFamilyId(entryId)) !== familyId) return null;

  const entry = await db.query.dinnerEntries.findFirst({
    where: eq(schema.dinnerEntries.id, entryId),
  });

  if (!entry) return null;

  // Validate sourceEntryId: no self-reference, no circular chains, source must
  // not be leftovers, and source must belong to the same family
  if (input.type === 'leftovers' && input.sourceEntryId) {
    if (input.sourceEntryId === entryId) return null;
    if ((await entryFamilyId(input.sourceEntryId)) !== familyId) return null;
    const sourceEntry = await db.query.dinnerEntries.findFirst({
      where: eq(schema.dinnerEntries.id, input.sourceEntryId),
    });
    if (!sourceEntry || sourceEntry.type === 'leftovers') return null;
  }

  const now = new Date().toISOString();

  // When type changes away from leftovers, clear sourceEntryId
  const sourceEntryId = input.type === 'leftovers' ? (input.sourceEntryId ?? null) : null;

  // Update entry
  await db
    .update(schema.dinnerEntries)
    .set({
      type: input.type,
      customText: input.customText,
      customSideText: input.customSideText ?? null,
      restaurantName: input.restaurantName,
      restaurantNotes: input.restaurantNotes,
      restaurantId: input.restaurantId ?? null,
      mainDishId: input.mainDishId,
      sourceEntryId,
      scale: input.scale ?? 1,
      sideScale: input.sideScale ?? 1,
      updatedAt: now,
    })
    .where(eq(schema.dinnerEntries.id, entryId));

  // Update side dishes
  await db.delete(schema.entrySideDishes).where(eq(schema.entrySideDishes.entryId, entryId));

  if (input.sideDishIds && input.sideDishIds.length > 0) {
    await db.insert(schema.entrySideDishes).values(
      input.sideDishIds.map((dishId) => ({
        entryId,
        dishId,
      }))
    );
  }

  return getEntryWithRelations(entryId);
}

/**
 * Mark entry as completed
 */
export async function markEntryCompleted(
  entryId: string,
  completed: boolean,
  familyId: string
): Promise<DinnerEntryResponse | null> {
  if ((await entryFamilyId(entryId)) !== familyId) return null;

  const entry = await db.query.dinnerEntries.findFirst({
    where: eq(schema.dinnerEntries.id, entryId),
  });

  if (!entry) return null;

  const now = new Date().toISOString();

  await db
    .update(schema.dinnerEntries)
    .set({ completed, updatedAt: now })
    .where(eq(schema.dinnerEntries.id, entryId));

  return getEntryWithRelations(entryId);
}

/**
 * Mark entry as skipped or not skipped
 */
export async function setSkipped(
  entryId: string,
  skipped: boolean,
  familyId: string
): Promise<DinnerEntryResponse | null> {
  if ((await entryFamilyId(entryId)) !== familyId) return null;

  const entry = await db.query.dinnerEntries.findFirst({
    where: eq(schema.dinnerEntries.id, entryId),
  });

  if (!entry) return null;

  const now = new Date().toISOString();

  await db
    .update(schema.dinnerEntries)
    .set({ skipped, updatedAt: now })
    .where(eq(schema.dinnerEntries.id, entryId));

  return getEntryWithRelations(entryId);
}

/**
 * Log a preparation, scoped to a family. Returns null if the dinner entry
 * (or a referenced dish/restaurant) doesn't belong to the requesting family.
 */
export async function logPreparation(
  input: CreatePreparationInput,
  familyId: string
): Promise<PreparationResponse | null> {
  if ((await entryFamilyId(input.dinnerEntryId)) !== familyId) return null;

  // Reject references to a dish/restaurant that exists but belongs to a
  // different family (cross-family data leak). A dishId/restaurantId that
  // doesn't exist at all is left to degrade gracefully below (dishName ends
  // up null) rather than being rejected outright -- that's existing,
  // unrelated behavior this bead doesn't change.
  if (input.dishId) {
    const dish = await db.query.dishes.findFirst({ where: eq(schema.dishes.id, input.dishId) });
    if (dish && dish.familyId !== familyId) return null;
  }

  if (input.restaurantId) {
    const restaurant = await db.query.restaurants.findFirst({
      where: eq(schema.restaurants.id, input.restaurantId),
    });
    if (restaurant && restaurant.familyId !== familyId) return null;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const today = formatDate(new Date());

  await db.insert(schema.preparations).values({
    id,
    dishId: input.dishId,
    restaurantId: input.restaurantId,
    dinnerEntryId: input.dinnerEntryId,
    preparedDate: today,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  });

  // Insert all preparers into the join table
  await db
    .insert(schema.preparationPreparers)
    .values(input.preparerIds.map((userId) => ({ preparationId: id, userId })));

  // Auto-complete the dinner entry
  await db
    .update(schema.dinnerEntries)
    .set({ completed: true, updatedAt: now })
    .where(eq(schema.dinnerEntries.id, input.dinnerEntryId));

  const dish = input.dishId
    ? await db.query.dishes.findFirst({
        where: eq(schema.dishes.id, input.dishId),
      })
    : null;

  const preparerUsers = await db
    .select()
    .from(schema.users)
    .where(inArray(schema.users.id, input.preparerIds));

  const preparers = preparerUsers.map((u) => ({ id: u.id, name: u.displayName }));

  return {
    id,
    dishId: input.dishId,
    dishName: dish?.name ?? null,
    restaurantId: input.restaurantId,
    preparers,
    preparedDate: today,
    notes: input.notes ?? null,
    createdAt: now,
  };
}

/**
 * Get preparation history for a dish, scoped to a family. Returns an empty
 * array if the dish doesn't exist or belongs to another family.
 */
export async function getDishPreparations(
  dishId: string,
  familyId: string
): Promise<PreparationResponse[]> {
  const dish = await db.query.dishes.findFirst({
    where: and(eq(schema.dishes.id, dishId), eq(schema.dishes.familyId, familyId)),
  });
  if (!dish) return [];

  const preps = await db
    .select()
    .from(schema.preparations)
    .where(eq(schema.preparations.dishId, dishId));

  const preparersMap = await fetchPreparersMap(preps.map((p) => p.id));

  const preparations = await Promise.all(
    preps.map(async (prep) => {
      const dish = prep.dishId
        ? await db.query.dishes.findFirst({
            where: eq(schema.dishes.id, prep.dishId),
          })
        : null;
      return {
        id: prep.id,
        dishId: prep.dishId,
        dishName: dish?.name ?? null,
        restaurantId: prep.restaurantId,
        preparers: preparersMap.get(prep.id) ?? [],
        preparedDate: prep.preparedDate,
        notes: prep.notes,
        createdAt: prep.createdAt,
      };
    })
  );

  // Sort by date descending
  preparations.sort((a, b) => b.preparedDate.localeCompare(a.preparedDate));

  return preparations;
}

/**
 * Delete a preparation, scoped to a family via its dinner entry's menu
 */
export async function deletePreparation(
  prepId: string,
  familyId: string
): Promise<{ success: boolean; error?: string }> {
  const prep = await db.query.preparations.findFirst({
    where: eq(schema.preparations.id, prepId),
  });

  if (!prep) {
    return { success: false, error: 'Preparation not found' };
  }

  if ((await entryFamilyId(prep.dinnerEntryId)) !== familyId) {
    return { success: false, error: 'Preparation not found' };
  }

  await db.delete(schema.preparations).where(eq(schema.preparations.id, prepId));

  // Check if there are other preparations for this entry
  const remainingPreps = await db
    .select()
    .from(schema.preparations)
    .where(eq(schema.preparations.dinnerEntryId, prep.dinnerEntryId));

  // If no more preparations, mark entry as not completed
  if (remainingPreps.length === 0) {
    await db
      .update(schema.dinnerEntries)
      .set({ completed: false, updatedAt: new Date().toISOString() })
      .where(eq(schema.dinnerEntries.id, prep.dinnerEntryId));
  }

  return { success: true };
}

/**
 * Get recently completed entries (last 14 days) that have a main dish.
 * Used by the leftovers picker.
 */
export async function getRecentCompleted(
  familyId: string
): Promise<{ id: string; date: string; mainDishName: string }[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = formatDate(cutoff);

  const entries = await db
    .select({
      id: schema.dinnerEntries.id,
      date: schema.dinnerEntries.date,
      mainDishId: schema.dinnerEntries.mainDishId,
    })
    .from(schema.dinnerEntries)
    .innerJoin(schema.weeklyMenus, eq(schema.dinnerEntries.menuId, schema.weeklyMenus.id))
    .where(
      and(
        eq(schema.weeklyMenus.familyId, familyId),
        eq(schema.dinnerEntries.completed, true),
        gte(schema.dinnerEntries.date, cutoffStr),
        isNotNull(schema.dinnerEntries.mainDishId)
      )
    )
    .orderBy(desc(schema.dinnerEntries.date));

  if (entries.length === 0) return [];

  const dishIds = [...new Set(entries.map((e) => e.mainDishId!))];
  const dishRows = await db.select().from(schema.dishes).where(inArray(schema.dishes.id, dishIds));
  const dishMap = new Map(dishRows.map((d) => [d.id, d.name]));

  return entries
    .filter((e) => dishMap.has(e.mainDishId!))
    .map((e) => ({ id: e.id, date: e.date, mainDishName: dishMap.get(e.mainDishId!)! }));
}
