import crypto from 'crypto';
import { eq } from 'drizzle-orm';
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
 * List all pantry items ordered by ingredientName.
 */
export async function listPantryItems(): Promise<PantryItem[]> {
  const rows = await db.select().from(schema.pantryItems);
  return rows.map(rowToPantryItem).sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
}

/**
 * Create a new pantry item.
 */
export async function createPantryItem(input: CreatePantryItemInput): Promise<PantryItem> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.pantryItems).values({
    id,
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
 * Update a pantry item by id. Returns null if not found.
 */
export async function updatePantryItem(
  id: string,
  input: UpdatePantryItemInput
): Promise<PantryItem | null> {
  const existing = await db.query.pantryItems.findFirst({
    where: eq(schema.pantryItems.id, id),
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
 * Delete a pantry item by id.
 */
export async function deletePantryItem(id: string): Promise<{ success: boolean }> {
  const existing = await db.query.pantryItems.findFirst({
    where: eq(schema.pantryItems.id, id),
  });
  if (!existing) return { success: false };

  await db.delete(schema.pantryItems).where(eq(schema.pantryItems.id, id));

  return { success: true };
}
