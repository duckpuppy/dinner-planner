import crypto from 'crypto';
import { eq, asc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

export interface CustomGroceryItem {
  id: string;
  weekDate: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  sortOrder: number;
  createdAt: string;
}

function rowToItem(row: {
  id: string;
  weekDate: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  sortOrder: number;
  createdAt: string;
}): CustomGroceryItem {
  return {
    id: row.id,
    weekDate: row.weekDate,
    name: row.name,
    quantity: row.quantity ?? null,
    unit: row.unit ?? null,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
  };
}

/**
 * Get all custom grocery items for a specific week.
 */
export async function getCustomItemsForWeek(weekDate: string): Promise<CustomGroceryItem[]> {
  const rows = await db
    .select()
    .from(schema.customGroceryItems)
    .where(eq(schema.customGroceryItems.weekDate, weekDate))
    .orderBy(asc(schema.customGroceryItems.sortOrder));

  return rows.map(rowToItem);
}

/**
 * Add a new custom grocery item for a week.
 */
export async function addCustomItem(
  weekDate: string,
  name: string,
  quantity: number | null,
  unit: string | null
): Promise<CustomGroceryItem> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // sortOrder = count of existing items for that week (appended at end)
  const existing = await db
    .select()
    .from(schema.customGroceryItems)
    .where(eq(schema.customGroceryItems.weekDate, weekDate));
  const sortOrder = existing.length;

  await db.insert(schema.customGroceryItems).values({
    id,
    weekDate,
    name,
    quantity: quantity ?? null,
    unit: unit ?? null,
    sortOrder,
    createdAt: now,
  });

  const rows = await db
    .select()
    .from(schema.customGroceryItems)
    .where(eq(schema.customGroceryItems.id, id));

  return rowToItem(rows[0]);
}

/**
 * Update an existing custom grocery item. Returns null if not found.
 */
export async function updateCustomItem(
  id: string,
  data: Partial<Pick<CustomGroceryItem, 'name' | 'quantity' | 'unit'>>
): Promise<CustomGroceryItem | null> {
  const existing = await db.query.customGroceryItems.findFirst({
    where: eq(schema.customGroceryItems.id, id),
  });
  if (!existing) return null;

  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.quantity !== undefined) updates.quantity = data.quantity ?? null;
  if (data.unit !== undefined) updates.unit = data.unit ?? null;

  await db
    .update(schema.customGroceryItems)
    .set(updates)
    .where(eq(schema.customGroceryItems.id, id));

  const rows = await db
    .select()
    .from(schema.customGroceryItems)
    .where(eq(schema.customGroceryItems.id, id));

  return rowToItem(rows[0]);
}

/**
 * Delete a custom grocery item by id. Returns true if deleted, false if not found.
 */
export async function deleteCustomItem(id: string): Promise<boolean> {
  const existing = await db.query.customGroceryItems.findFirst({
    where: eq(schema.customGroceryItems.id, id),
  });
  if (!existing) return false;

  await db.delete(schema.customGroceryItems).where(eq(schema.customGroceryItems.id, id));

  return true;
}
