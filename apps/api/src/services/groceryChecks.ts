import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

/**
 * Get all checked item keys for a given week and family.
 * Returns an array of item_key strings that have a check row.
 */
export async function getCheckedKeys(weekDate: string, familyId: string): Promise<string[]> {
  const rows = await db
    .select({ itemKey: schema.groceryChecks.itemKey })
    .from(schema.groceryChecks)
    .where(
      and(eq(schema.groceryChecks.weekDate, weekDate), eq(schema.groceryChecks.familyId, familyId))
    );

  return rows.map((r) => r.itemKey);
}

/**
 * Toggle a grocery check for the given week, item, and family.
 * If a row exists, delete it and return false (unchecked).
 * If no row exists, insert one and return true (checked).
 */
export async function toggleCheck(
  weekDate: string,
  itemKey: string,
  itemName: string,
  userId: string,
  familyId: string
): Promise<boolean> {
  const existing = await db
    .select()
    .from(schema.groceryChecks)
    .where(
      and(
        eq(schema.groceryChecks.weekDate, weekDate),
        eq(schema.groceryChecks.itemKey, itemKey),
        eq(schema.groceryChecks.familyId, familyId)
      )
    );

  if (existing.length > 0) {
    await db
      .delete(schema.groceryChecks)
      .where(
        and(
          eq(schema.groceryChecks.weekDate, weekDate),
          eq(schema.groceryChecks.itemKey, itemKey),
          eq(schema.groceryChecks.familyId, familyId)
        )
      );
    return false;
  }

  await db.insert(schema.groceryChecks).values({
    familyId,
    weekDate,
    itemKey,
    itemName,
    checkedByUserId: userId,
  });
  return true;
}

/**
 * Clear all grocery checks for a given week and family.
 */
export async function clearAllChecks(weekDate: string, familyId: string): Promise<void> {
  await db
    .delete(schema.groceryChecks)
    .where(
      and(eq(schema.groceryChecks.weekDate, weekDate), eq(schema.groceryChecks.familyId, familyId))
    );
}
