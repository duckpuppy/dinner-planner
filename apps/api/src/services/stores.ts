import { and, eq, asc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db, schema } from '../db/index.js';

export interface Store {
  id: string;
  name: string;
  createdAt: string;
}

/**
 * List all managed stores for a family, sorted alphabetically by name.
 */
export async function listStores(familyId: string): Promise<Store[]> {
  return db
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.familyId, familyId))
    .orderBy(asc(schema.stores.name));
}

/**
 * Find an existing store by name within a family, or create a new one.
 * Trims whitespace from the name before lookup/insert.
 */
export async function findOrCreateStore(name: string, familyId: string): Promise<Store> {
  const trimmed = name.trim();
  const existing = await db
    .select()
    .from(schema.stores)
    .where(and(eq(schema.stores.name, trimmed), eq(schema.stores.familyId, familyId)))
    .limit(1);
  if (existing.length > 0) return existing[0];
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.insert(schema.stores).values({ id, familyId, name: trimmed, createdAt: now });
  return { id, name: trimmed, createdAt: now };
}

/**
 * Check whether a store ID belongs to a family. Used to validate
 * client-supplied storeId references (e.g. on custom/standing grocery
 * items) don't cross family boundaries.
 */
export async function isStoreInFamily(storeId: string, familyId: string): Promise<boolean> {
  const store = await db.query.stores.findFirst({
    where: and(eq(schema.stores.id, storeId), eq(schema.stores.familyId, familyId)),
  });
  return !!store;
}

/**
 * Delete a store by ID, scoped to a family. Returns false if the store does
 * not exist, belongs to another family, or is still referenced by
 * ingredient_stores rows (to prevent orphaning data).
 */
export async function deleteStore(id: string, familyId: string): Promise<boolean> {
  const store = await db.query.stores.findFirst({
    where: and(eq(schema.stores.id, id), eq(schema.stores.familyId, familyId)),
  });
  if (!store) return false;

  const usages = await db
    .select()
    .from(schema.ingredientStores)
    .where(eq(schema.ingredientStores.storeId, id))
    .limit(1);
  if (usages.length > 0) return false;

  const result = await db.delete(schema.stores).where(eq(schema.stores.id, id));
  return (result.changes ?? 0) > 0;
}
