import crypto from 'crypto';
import { eq, inArray, desc, and, gte, isNotNull } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { UpdateDinnerEntryInput, CreatePreparationInput } from '@dinner-planner/shared';

// Helper to get the week start date (based on app settings)
async function getWeekStartDay(): Promise<number> {
  const settings = await db.query.appSettings.findFirst({
    where: eq(schema.appSettings.id, 'default'),
  });
  return settings?.weekStartDay ?? 0; // Default to Sunday
}

// Calculate the start date of the week containing a given date
function getWeekStartDate(date: Date, weekStartDay: number): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day - weekStartDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Format date as YYYY-MM-DD using local date methods (respects TZ env var)
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Parse YYYY-MM-DD string to Date
function parseDate(dateStr: string): Date {
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

export interface DinnerEntryResponse {
  id: string;
  date: string;
  dayOfWeek: number;
  type: 'assembled' | 'fend_for_self' | 'dining_out' | 'custom' | 'leftovers';
  customText: string | null;
  restaurantName: string | null;
  restaurantNotes: string | null;
  completed: boolean;
  skipped: boolean;
  scale: number;
  mainDish: {
    id: string;
    name: string;
    type: 'main' | 'side';
  } | null;
  sideDishes: {
    id: string;
    name: string;
    type: 'main' | 'side';
  }[];
  preparations: PreparationResponse[];
  sourceEntryId: string | null;
  sourceEntryDishName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PreparationResponse {
  id: string;
  dishId: string;
  dishName: string;
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
      const dish = await db.query.dishes.findFirst({
        where: eq(schema.dishes.id, prep.dishId),
      });
      return {
        id: prep.id,
        dishId: prep.dishId,
        dishName: dish?.name ?? 'Unknown',
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

  const entryDate = parseDate(entry.date);

  return {
    id: entry.id,
    date: entry.date,
    dayOfWeek: entryDate.getDay(),
    type: entry.type,
    customText: entry.customText,
    restaurantName: entry.restaurantName,
    restaurantNotes: entry.restaurantNotes,
    completed: entry.completed,
    skipped: entry.skipped,
    scale: entry.scale,
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
 * Get or create a weekly menu for a given date
 */
export async function getOrCreateWeekMenu(dateStr: string): Promise<WeeklyMenuResponse> {
  const weekStartDay = await getWeekStartDay();
  const date = parseDate(dateStr);
  const weekStart = getWeekStartDate(date, weekStartDay);
  const weekStartStr = formatDate(weekStart);

  // Check if menu exists
  let menu = await db.query.weeklyMenus.findFirst({
    where: eq(schema.weeklyMenus.weekStartDate, weekStartStr),
  });

  if (!menu) {
    // Create new menu
    const menuId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.insert(schema.weeklyMenus).values({
      id: menuId,
      weekStartDate: weekStartStr,
      createdAt: now,
      updatedAt: now,
    });

    // Create entries for each day of the week
    for (let i = 0; i < 7; i++) {
      const entryDate = new Date(weekStart);
      entryDate.setDate(entryDate.getDate() + i);
      const entryId = crypto.randomUUID();

      await db.insert(schema.dinnerEntries).values({
        id: entryId,
        menuId,
        date: formatDate(entryDate),
        type: 'assembled',
        completed: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    menu = await db.query.weeklyMenus.findFirst({
      where: eq(schema.weeklyMenus.id, menuId),
    });
  }

  // Get entries
  const entries = await db
    .select()
    .from(schema.dinnerEntries)
    .where(eq(schema.dinnerEntries.menuId, menu!.id));

  const entriesWithRelations = await Promise.all(
    entries.map(async (entry) => (await getEntryWithRelations(entry.id))!)
  );

  // Sort by date
  entriesWithRelations.sort((a, b) => a.date.localeCompare(b.date));

  return {
    id: menu!.id,
    weekStartDate: menu!.weekStartDate,
    entries: entriesWithRelations,
    createdAt: menu!.createdAt,
    updatedAt: menu!.updatedAt,
  };
}

/**
 * Get today's dinner entry
 */
export async function getTodayEntry(): Promise<DinnerEntryResponse | null> {
  const today = formatDate(new Date());

  const entry = await db.query.dinnerEntries.findFirst({
    where: eq(schema.dinnerEntries.date, today),
  });

  if (!entry) {
    // Auto-create by fetching the week
    await getOrCreateWeekMenu(today);
    const newEntry = await db.query.dinnerEntries.findFirst({
      where: eq(schema.dinnerEntries.date, today),
    });
    return newEntry ? getEntryWithRelations(newEntry.id) : null;
  }

  return getEntryWithRelations(entry.id);
}

/**
 * Update a dinner entry
 */
export async function updateDinnerEntry(
  entryId: string,
  input: UpdateDinnerEntryInput
): Promise<DinnerEntryResponse | null> {
  const entry = await db.query.dinnerEntries.findFirst({
    where: eq(schema.dinnerEntries.id, entryId),
  });

  if (!entry) return null;

  // Validate sourceEntryId: no self-reference, no circular chains, source must not be leftovers
  if (input.type === 'leftovers' && input.sourceEntryId) {
    if (input.sourceEntryId === entryId) return null;
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
      restaurantName: input.restaurantName,
      restaurantNotes: input.restaurantNotes,
      mainDishId: input.mainDishId,
      sourceEntryId,
      scale: input.scale ?? 1,
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
  completed: boolean
): Promise<DinnerEntryResponse | null> {
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
  skipped: boolean
): Promise<DinnerEntryResponse | null> {
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
 * Log a preparation
 */
export async function logPreparation(input: CreatePreparationInput): Promise<PreparationResponse> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const today = formatDate(new Date());

  await db.insert(schema.preparations).values({
    id,
    dishId: input.dishId,
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

  const dish = await db.query.dishes.findFirst({
    where: eq(schema.dishes.id, input.dishId),
  });

  const preparerUsers = await db
    .select()
    .from(schema.users)
    .where(inArray(schema.users.id, input.preparerIds));

  const preparers = preparerUsers.map((u) => ({ id: u.id, name: u.displayName }));

  return {
    id,
    dishId: input.dishId,
    dishName: dish?.name ?? 'Unknown',
    preparers,
    preparedDate: today,
    notes: input.notes ?? null,
    createdAt: now,
  };
}

/**
 * Get preparation history for a dish
 */
export async function getDishPreparations(dishId: string): Promise<PreparationResponse[]> {
  const preps = await db
    .select()
    .from(schema.preparations)
    .where(eq(schema.preparations.dishId, dishId));

  const preparersMap = await fetchPreparersMap(preps.map((p) => p.id));

  const preparations = await Promise.all(
    preps.map(async (prep) => {
      const dish = await db.query.dishes.findFirst({
        where: eq(schema.dishes.id, prep.dishId),
      });
      return {
        id: prep.id,
        dishId: prep.dishId,
        dishName: dish?.name ?? 'Unknown',
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
 * Delete a preparation
 */
export async function deletePreparation(
  prepId: string
): Promise<{ success: boolean; error?: string }> {
  const prep = await db.query.preparations.findFirst({
    where: eq(schema.preparations.id, prepId),
  });

  if (!prep) {
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
export async function getRecentCompleted(): Promise<
  { id: string; date: string; mainDishName: string }[]
> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = formatDate(cutoff);

  const entries = await db
    .select()
    .from(schema.dinnerEntries)
    .where(
      and(
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
