import crypto from 'crypto';
import { and, eq, asc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { isStoreInFamily } from './stores.js';

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
 * List all standing grocery items for a family, sorted by name, joined with store name.
 */
export async function listStandingItems(familyId: string): Promise<StandingItemRow[]> {
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
    .where(eq(schema.standingItems.familyId, familyId))
    .orderBy(asc(schema.standingItems.name));

  return rows.map(rowToItem);
}

/**
 * Add a new standing grocery item, scoped to a family. Returns the full row
 * including storeName.
 */
export async function addStandingItem(
  name: string,
  quantity: number | null,
  unit: string | null,
  category: string,
  storeId: string | null | undefined,
  userId: string,
  familyId: string
): Promise<StandingItemRow> {
  const id = crypto.randomUUID();

  // Ignore a storeId that doesn't belong to this family rather than trusting
  // client input at face value (dinner-7pt.5: stores are now family-scoped).
  const safeStoreId = storeId && (await isStoreInFamily(storeId, familyId)) ? storeId : null;

  await db.insert(schema.standingItems).values({
    id,
    familyId,
    name,
    quantity: quantity ?? null,
    unit: unit ?? null,
    category,
    storeId: safeStoreId,
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
 * Delete a standing item by id, scoped to a family. Returns true if found
 * and deleted, false if not found or belongs to another family.
 */
export async function deleteStandingItem(id: string, familyId: string): Promise<boolean> {
  const existing = await db.query.standingItems.findFirst({
    where: and(eq(schema.standingItems.id, id), eq(schema.standingItems.familyId, familyId)),
  });
  if (!existing) return false;

  await db.delete(schema.standingItems).where(eq(schema.standingItems.id, id));

  return true;
}
