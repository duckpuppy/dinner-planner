import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { CreatePatternInput, UpdatePatternInput } from '@dinner-planner/shared';

export interface PatternResponse {
  id: string;
  label: string;
  dayOfWeek: number;
  type: 'assembled' | 'fend_for_self' | 'dining_out' | 'custom';
  mainDishId: string | null;
  mainDish: { id: string; name: string; type: 'main' | 'side' } | null;
  sideDishIds: string[];
  sideDishes: { id: string; name: string; type: 'main' | 'side' }[];
  customText: string | null;
  createdById: string;
  createdAt: string;
}

async function getPatternWithRelations(patternId: string): Promise<PatternResponse | null> {
  const pattern = await db.query.recurringPatterns.findFirst({
    where: eq(schema.recurringPatterns.id, patternId),
  });

  if (!pattern) return null;

  // Get main dish
  let mainDish = null;
  if (pattern.mainDishId) {
    const dish = await db.query.dishes.findFirst({
      where: eq(schema.dishes.id, pattern.mainDishId),
    });
    if (dish) {
      mainDish = { id: dish.id, name: dish.name, type: dish.type };
    }
  }

  // Get side dishes
  const sideLinks = await db
    .select()
    .from(schema.patternSideDishes)
    .where(eq(schema.patternSideDishes.patternId, patternId));

  const sideDishes = (
    await Promise.all(
      sideLinks.map(async (link) => {
        const dish = await db.query.dishes.findFirst({
          where: eq(schema.dishes.id, link.dishId),
        });
        return dish ? { id: dish.id, name: dish.name, type: dish.type } : null;
      })
    )
  ).filter((d): d is NonNullable<typeof d> => d !== null);

  return {
    id: pattern.id,
    label: pattern.label,
    dayOfWeek: pattern.dayOfWeek,
    type: pattern.type,
    mainDishId: pattern.mainDishId,
    mainDish,
    sideDishIds: sideLinks.map((l) => l.dishId),
    sideDishes,
    customText: pattern.customText,
    createdById: pattern.createdById,
    createdAt: pattern.createdAt,
  };
}

/**
 * List all recurring patterns
 */
export async function listPatterns(): Promise<PatternResponse[]> {
  const patterns = await db.select().from(schema.recurringPatterns);

  const results = await Promise.all(patterns.map((p) => getPatternWithRelations(p.id)));

  return results
    .filter((p): p is PatternResponse => p !== null)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.label.localeCompare(b.label));
}

/**
 * Get a single pattern by ID
 */
export async function getPattern(patternId: string): Promise<PatternResponse | null> {
  return getPatternWithRelations(patternId);
}

/**
 * Create a recurring pattern
 */
export async function createPattern(
  input: CreatePatternInput,
  createdById: string
): Promise<PatternResponse> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.recurringPatterns).values({
    id,
    label: input.label,
    dayOfWeek: input.dayOfWeek,
    type: input.type,
    mainDishId: input.mainDishId,
    customText: input.customText,
    createdById,
    createdAt: now,
  });

  if (input.sideDishIds && input.sideDishIds.length > 0) {
    await db
      .insert(schema.patternSideDishes)
      .values(input.sideDishIds.map((dishId) => ({ patternId: id, dishId })));
  }

  return (await getPatternWithRelations(id))!;
}

/**
 * Update a recurring pattern
 */
export async function updatePattern(
  patternId: string,
  input: UpdatePatternInput
): Promise<PatternResponse | null> {
  const pattern = await db.query.recurringPatterns.findFirst({
    where: eq(schema.recurringPatterns.id, patternId),
  });

  if (!pattern) return null;

  const updates: Partial<typeof schema.recurringPatterns.$inferInsert> = {};
  if (input.label !== undefined) updates.label = input.label;
  if (input.dayOfWeek !== undefined) updates.dayOfWeek = input.dayOfWeek;
  if (input.type !== undefined) updates.type = input.type;
  if ('mainDishId' in input) updates.mainDishId = input.mainDishId;
  if ('customText' in input) updates.customText = input.customText;

  if (Object.keys(updates).length > 0) {
    await db
      .update(schema.recurringPatterns)
      .set(updates)
      .where(eq(schema.recurringPatterns.id, patternId));
  }

  // Replace side dishes if provided
  if (input.sideDishIds !== undefined) {
    await db
      .delete(schema.patternSideDishes)
      .where(eq(schema.patternSideDishes.patternId, patternId));

    if (input.sideDishIds.length > 0) {
      await db
        .insert(schema.patternSideDishes)
        .values(input.sideDishIds.map((dishId) => ({ patternId, dishId })));
    }
  }

  return getPatternWithRelations(patternId);
}

/**
 * Delete a recurring pattern
 */
export async function deletePattern(patternId: string): Promise<boolean> {
  const pattern = await db.query.recurringPatterns.findFirst({
    where: eq(schema.recurringPatterns.id, patternId),
  });

  if (!pattern) return false;

  // patternSideDishes cascade on delete
  await db.delete(schema.recurringPatterns).where(eq(schema.recurringPatterns.id, patternId));

  return true;
}

/**
 * Apply patterns to a week's dinner entries.
 * Only overwrites entries that are still "assembled" with no main dish set
 * (i.e. untouched default entries). Returns count of entries updated.
 */
export async function applyPatternsToWeek(weekStartDate: string): Promise<{ applied: number }> {
  // Get all entries for the week
  const menu = await db.query.weeklyMenus.findFirst({
    where: eq(schema.weeklyMenus.weekStartDate, weekStartDate),
  });

  if (!menu) return { applied: 0 };

  const entries = await db
    .select()
    .from(schema.dinnerEntries)
    .where(eq(schema.dinnerEntries.menuId, menu.id));

  const patterns = await db.select().from(schema.recurringPatterns);
  const now = new Date().toISOString();
  let applied = 0;

  for (const entry of entries) {
    // Only apply to untouched entries (assembled, no main dish, no custom text)
    if (entry.type !== 'assembled' || entry.mainDishId || entry.customText) {
      continue;
    }

    // Parse entry date to get day of week
    const [year, month, day] = entry.date.split('-').map(Number);
    const entryDate = new Date(year, month - 1, day);
    const dayOfWeek = entryDate.getDay();

    // Find matching pattern (first match wins)
    const pattern = patterns.find((p) => p.dayOfWeek === dayOfWeek);
    if (!pattern) continue;

    // Get pattern side dishes
    const sideLinks = await db
      .select()
      .from(schema.patternSideDishes)
      .where(eq(schema.patternSideDishes.patternId, pattern.id));

    // Update the entry
    await db
      .update(schema.dinnerEntries)
      .set({
        type: pattern.type,
        mainDishId: pattern.mainDishId,
        customText: pattern.customText,
        restaurantName: null,
        restaurantNotes: null,
        updatedAt: now,
      })
      .where(eq(schema.dinnerEntries.id, entry.id));

    // Replace side dishes
    await db.delete(schema.entrySideDishes).where(eq(schema.entrySideDishes.entryId, entry.id));

    if (sideLinks.length > 0) {
      await db
        .insert(schema.entrySideDishes)
        .values(sideLinks.map((link) => ({ entryId: entry.id, dishId: link.dishId })));
    }

    applied++;
  }

  return { applied };
}
