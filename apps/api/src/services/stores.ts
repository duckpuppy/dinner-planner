import { eq, asc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db, schema } from '../db/index.js';

export interface Store {
  id: string;
  name: string;
  createdAt: string;
}

/**
 * List all managed stores sorted alphabetically by name.
 */
export async function listStores(): Promise<Store[]> {
  return db.select().from(schema.stores).orderBy(asc(schema.stores.name));
}

/**
 * Find an existing store by name or create a new one.
 * Trims whitespace from the name before lookup/insert.
 */
export async function findOrCreateStore(name: string): Promise<Store> {
  const trimmed = name.trim();
  const existing = await db
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.name, trimmed))
    .limit(1);
  if (existing.length > 0) return existing[0];
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.insert(schema.stores).values({ id, name: trimmed, createdAt: now });
  return { id, name: trimmed, createdAt: now };
}

/**
 * Delete a store by ID. Returns false if the store does not exist or is still
 * referenced by ingredient_stores rows (to prevent orphaning data).
 */
export async function deleteStore(id: string): Promise<boolean> {
  const usages = await db
    .select()
    .from(schema.ingredientStores)
    .where(eq(schema.ingredientStores.storeId, id))
    .limit(1);
  if (usages.length > 0) return false;

  const result = await db.delete(schema.stores).where(eq(schema.stores.id, id));
  return (result.changes ?? 0) > 0;
}
