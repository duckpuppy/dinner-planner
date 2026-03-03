import crypto from 'crypto';
import { eq, asc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

export interface StandingItemRow {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string;
  storeId: string | null;
  storeName: string | null;
}

function rowToItem(row: {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string;
  storeId: string | null;
  storeName: string | null;
}): StandingItemRow {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity ?? null,
    unit: row.unit ?? null,
    category: row.category,
    storeId: row.storeId ?? null,
    storeName: row.storeName ?? null,
  };
}

/**
 * List all standing grocery items, sorted by name, joined with store name.
 */
export async function listStandingItems(): Promise<StandingItemRow[]> {
  const rows = await db
    .select({
      id: schema.standingItems.id,
      name: schema.standingItems.name,
      quantity: schema.standingItems.quantity,
      unit: schema.standingItems.unit,
      category: schema.standingItems.category,
      storeId: schema.standingItems.storeId,
      storeName: schema.stores.name,
    })
    .from(schema.standingItems)
    .leftJoin(schema.stores, eq(schema.standingItems.storeId, schema.stores.id))
    .orderBy(asc(schema.standingItems.name));

  return rows.map(rowToItem);
}

/**
 * Add a new standing grocery item. Returns the full row including storeName.
 */
export async function addStandingItem(
  name: string,
  quantity: number | null,
  unit: string | null,
  category: string,
  storeId: string | null | undefined,
  userId: string
): Promise<StandingItemRow> {
  const id = crypto.randomUUID();

  await db.insert(schema.standingItems).values({
    id,
    name,
    quantity: quantity ?? null,
    unit: unit ?? null,
    category,
    storeId: storeId ?? null,
    createdBy: userId,
  });

  const rows = await db
    .select({
      id: schema.standingItems.id,
      name: schema.standingItems.name,
      quantity: schema.standingItems.quantity,
      unit: schema.standingItems.unit,
      category: schema.standingItems.category,
      storeId: schema.standingItems.storeId,
      storeName: schema.stores.name,
    })
    .from(schema.standingItems)
    .leftJoin(schema.stores, eq(schema.standingItems.storeId, schema.stores.id))
    .where(eq(schema.standingItems.id, id));

  return rowToItem(rows[0]);
}

/**
 * Delete a standing item by id. Returns true if found and deleted, false if not found.
 */
export async function deleteStandingItem(id: string): Promise<boolean> {
  const existing = await db.query.standingItems.findFirst({
    where: eq(schema.standingItems.id, id),
  });
  if (!existing) return false;

  await db.delete(schema.standingItems).where(eq(schema.standingItems.id, id));

  return true;
}
