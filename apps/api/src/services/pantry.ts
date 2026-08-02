import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type {
  CreatePantryItemInput,
  UpdatePantryItemInput,
  PantryItem,
} from '@dinner-planner/shared';

function rowToPantryItem(row: {
  id: string;
  ingredientName: string;
  quantity: number | null;
  unit: string | null;
  expiresAt: string | null;
  createdAt: string;
}): PantryItem {
  return {
    id: row.id,
    ingredientName: row.ingredientName,
    quantity: row.quantity ?? null,
    unit: row.unit ?? null,
    expiresAt: row.expiresAt ?? null,
    createdAt: row.createdAt,
  };
}

/**
 * List all pantry items for a family, ordered by ingredientName.
 */
export async function listPantryItems(familyId: string): Promise<PantryItem[]> {
  const rows = await db
    .select()
    .from(schema.pantryItems)
    .where(eq(schema.pantryItems.familyId, familyId));
  return rows.map(rowToPantryItem).sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
}

/**
 * Create a new pantry item, scoped to a family.
 */
export async function createPantryItem(
  input: CreatePantryItemInput,
  familyId: string
): Promise<PantryItem> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.pantryItems).values({
    id,
    familyId,
    ingredientName: input.ingredientName,
    quantity: input.quantity ?? null,
    unit: input.unit ?? null,
    expiresAt: input.expiresAt ?? null,
    createdAt: now,
  });

  const rows = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.id, id));

  return rowToPantryItem(rows[0]);
}

/**
 * Update a pantry item by id, scoped to a family. Returns null if not found
 * or belongs to another family (both cases behave as "not found").
 */
export async function updatePantryItem(
  id: string,
  input: UpdatePantryItemInput,
  familyId: string
): Promise<PantryItem | null> {
  const existing = await db.query.pantryItems.findFirst({
    where: and(eq(schema.pantryItems.id, id), eq(schema.pantryItems.familyId, familyId)),
  });
  if (!existing) return null;

  const updates: Partial<typeof existing> = {};
  if (input.ingredientName !== undefined) updates.ingredientName = input.ingredientName;
  if (input.quantity !== undefined) updates.quantity = input.quantity ?? null;
  if (input.unit !== undefined) updates.unit = input.unit ?? null;
  if (input.expiresAt !== undefined) updates.expiresAt = input.expiresAt ?? null;

  await db.update(schema.pantryItems).set(updates).where(eq(schema.pantryItems.id, id));

  const rows = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.id, id));

  return rowToPantryItem(rows[0]);
}

/**
 * Delete a pantry item by id, scoped to a family.
 */
export async function deletePantryItem(
  id: string,
  familyId: string
): Promise<{ success: boolean }> {
  const existing = await db.query.pantryItems.findFirst({
    where: and(eq(schema.pantryItems.id, id), eq(schema.pantryItems.familyId, familyId)),
  });
  if (!existing) return { success: false };

  await db.delete(schema.pantryItems).where(eq(schema.pantryItems.id, id));

  return { success: true };
}
