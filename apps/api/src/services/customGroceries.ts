import crypto from 'crypto';
import { and, eq, asc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { isStoreInFamily } from './stores.js';

export interface CustomGroceryItem {
  id: string;
  weekDate: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  sortOrder: number;
  createdAt: string;
  storeId: string | null;
  storeName: string | null;
}

function rowToItem(row: {
  id: string;
  weekDate: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  sortOrder: number;
  createdAt: string;
  storeId: string | null;
  storeName: string | null;
}): CustomGroceryItem {
  return {
    id: row.id,
    weekDate: row.weekDate,
    name: row.name,
    quantity: row.quantity ?? null,
    unit: row.unit ?? null,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    storeId: row.storeId ?? null,
    storeName: row.storeName ?? null,
  };
}

/**
 * Get all custom grocery items for a specific week and family, joined with store name.
 */
export async function getCustomItemsForWeek(
  weekDate: string,
  familyId: string
): Promise<CustomGroceryItem[]> {
  const rows = await db
    .select({
      id: schema.customGroceryItems.id,
      weekDate: schema.customGroceryItems.weekDate,
      name: schema.customGroceryItems.name,
      quantity: schema.customGroceryItems.quantity,
      unit: schema.customGroceryItems.unit,
      sortOrder: schema.customGroceryItems.sortOrder,
      createdAt: schema.customGroceryItems.createdAt,
      storeId: schema.customGroceryItems.storeId,
      storeName: schema.stores.name,
    })
    .from(schema.customGroceryItems)
    .leftJoin(schema.stores, eq(schema.customGroceryItems.storeId, schema.stores.id))
    .where(
      and(
        eq(schema.customGroceryItems.weekDate, weekDate),
        eq(schema.customGroceryItems.familyId, familyId)
      )
    )
    .orderBy(asc(schema.customGroceryItems.sortOrder));

  return rows.map(rowToItem);
}

async function selectCustomItemById(
  id: string
): Promise<(CustomGroceryItem & { familyId: string }) | null> {
  const rows = await db
    .select({
      id: schema.customGroceryItems.id,
      familyId: schema.customGroceryItems.familyId,
      weekDate: schema.customGroceryItems.weekDate,
      name: schema.customGroceryItems.name,
      quantity: schema.customGroceryItems.quantity,
      unit: schema.customGroceryItems.unit,
      sortOrder: schema.customGroceryItems.sortOrder,
      createdAt: schema.customGroceryItems.createdAt,
      storeId: schema.customGroceryItems.storeId,
      storeName: schema.stores.name,
    })
    .from(schema.customGroceryItems)
    .leftJoin(schema.stores, eq(schema.customGroceryItems.storeId, schema.stores.id))
    .where(eq(schema.customGroceryItems.id, id));
  if (rows.length === 0) return null;
  return { ...rowToItem(rows[0]), familyId: rows[0].familyId };
}

/**
 * Add a new custom grocery item for a week, scoped to a family.
 *
 * Idempotent when a client-supplied `id` is given: the insert is
 * ON CONFLICT DO NOTHING, so a replay is a no-op (first write wins) and
 * returns the existing row with `created: false`. Returns null when the id
 * already belongs to another family (callers respond 404 so existence is not
 * disclosed).
 */
export async function addCustomItem(
  weekDate: string,
  name: string,
  quantity: number | null,
  unit: string | null,
  storeId: string | null | undefined,
  familyId: string,
  clientId?: string
): Promise<{ item: CustomGroceryItem; created: boolean } | null> {
  const id = clientId ?? crypto.randomUUID();
  const now = new Date().toISOString();

  // sortOrder = count of existing items for that week+family (appended at end)
  const existing = await db
    .select()
    .from(schema.customGroceryItems)
    .where(
      and(
        eq(schema.customGroceryItems.weekDate, weekDate),
        eq(schema.customGroceryItems.familyId, familyId)
      )
    );
  const sortOrder = existing.length;

  // Ignore a storeId that doesn't belong to this family rather than trusting
  // client input at face value (dinner-7pt.5: stores are now family-scoped).
  const safeStoreId = storeId && (await isStoreInFamily(storeId, familyId)) ? storeId : null;

  const inserted = await db
    .insert(schema.customGroceryItems)
    .values({
      id,
      familyId,
      weekDate,
      name,
      quantity: quantity ?? null,
      unit: unit ?? null,
      sortOrder,
      createdAt: now,
      storeId: safeStoreId,
    })
    .onConflictDoNothing()
    .returning({ id: schema.customGroceryItems.id });

  const row = await selectCustomItemById(id);
  if (!row || row.familyId !== familyId) return null;
  const { familyId: _familyId, ...item } = row;
  void _familyId;
  return { item, created: inserted.length > 0 };
}

/**
 * Update an existing custom grocery item, scoped to a family. Returns null
 * if not found or belongs to another family (both cases behave as "not found").
 */
export async function updateCustomItem(
  id: string,
  data: Partial<Pick<CustomGroceryItem, 'name' | 'quantity' | 'unit' | 'storeId'>>,
  familyId: string
): Promise<CustomGroceryItem | null> {
  const existing = await db.query.customGroceryItems.findFirst({
    where: and(
      eq(schema.customGroceryItems.id, id),
      eq(schema.customGroceryItems.familyId, familyId)
    ),
  });
  if (!existing) return null;

  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.quantity !== undefined) updates.quantity = data.quantity ?? null;
  if (data.unit !== undefined) updates.unit = data.unit ?? null;
  if (data.storeId !== undefined) {
    updates.storeId =
      data.storeId && (await isStoreInFamily(data.storeId, familyId)) ? data.storeId : null;
  }

  await db
    .update(schema.customGroceryItems)
    .set(updates)
    .where(eq(schema.customGroceryItems.id, id));

  const rows = await db
    .select({
      id: schema.customGroceryItems.id,
      weekDate: schema.customGroceryItems.weekDate,
      name: schema.customGroceryItems.name,
      quantity: schema.customGroceryItems.quantity,
      unit: schema.customGroceryItems.unit,
      sortOrder: schema.customGroceryItems.sortOrder,
      createdAt: schema.customGroceryItems.createdAt,
      storeId: schema.customGroceryItems.storeId,
      storeName: schema.stores.name,
    })
    .from(schema.customGroceryItems)
    .leftJoin(schema.stores, eq(schema.customGroceryItems.storeId, schema.stores.id))
    .where(eq(schema.customGroceryItems.id, id));

  return rowToItem(rows[0]);
}

/**
 * Delete a custom grocery item by id, scoped to a family. Idempotent:
 * `deleted` is true only when a row was actually removed (false when already
 * gone, never existed, or belongs to another family). The item's
 * grocery_checks row is intentionally left alone, as before.
 */
export async function deleteCustomItem(
  id: string,
  familyId: string
): Promise<{ deleted: boolean }> {
  const removed = await db
    .delete(schema.customGroceryItems)
    .where(
      and(eq(schema.customGroceryItems.id, id), eq(schema.customGroceryItems.familyId, familyId))
    )
    .returning({ id: schema.customGroceryItems.id });

  return { deleted: removed.length > 0 };
}
