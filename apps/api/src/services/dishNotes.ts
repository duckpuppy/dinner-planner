import crypto from 'crypto';
import { eq, and, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { DishNote } from '@dinner-planner/shared';

/**
 * Get all notes for a dish, ordered by createdAt desc, joined to users for
 * username. Scoped to a family; returns an empty array if the dish doesn't
 * exist or belongs to another family.
 */
export async function getDishNotes(dishId: string, familyId: string): Promise<DishNote[]> {
  const dish = await db.query.dishes.findFirst({
    where: and(eq(schema.dishes.id, dishId), eq(schema.dishes.familyId, familyId)),
  });
  if (!dish) return [];

  const rows = await db
    .select({
      id: schema.dishNotes.id,
      dishId: schema.dishNotes.dishId,
      note: schema.dishNotes.note,
      createdById: schema.dishNotes.createdById,
      createdAt: schema.dishNotes.createdAt,
      createdByUsername: schema.users.username,
    })
    .from(schema.dishNotes)
    .leftJoin(schema.users, eq(schema.dishNotes.createdById, schema.users.id))
    .where(eq(schema.dishNotes.dishId, dishId))
    .orderBy(desc(schema.dishNotes.createdAt));

  return rows.map((row) => ({
    id: row.id,
    dishId: row.dishId,
    note: row.note,
    createdById: row.createdById ?? null,
    createdByUsername: row.createdByUsername ?? null,
    createdAt: row.createdAt,
  }));
}

/**
 * Create a note for a dish, scoped to a family. Returns null if the dish
 * doesn't exist or belongs to another family.
 */
export async function createDishNote(
  dishId: string,
  note: string,
  createdById: string,
  familyId: string
): Promise<DishNote | null> {
  const dish = await db.query.dishes.findFirst({
    where: and(eq(schema.dishes.id, dishId), eq(schema.dishes.familyId, familyId)),
  });
  if (!dish) return null;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.dishNotes).values({
    id,
    dishId,
    note,
    createdById,
    createdAt: now,
  });

  const rows = await db
    .select({
      id: schema.dishNotes.id,
      dishId: schema.dishNotes.dishId,
      note: schema.dishNotes.note,
      createdById: schema.dishNotes.createdById,
      createdAt: schema.dishNotes.createdAt,
      createdByUsername: schema.users.username,
    })
    .from(schema.dishNotes)
    .leftJoin(schema.users, eq(schema.dishNotes.createdById, schema.users.id))
    .where(eq(schema.dishNotes.id, id));

  if (rows.length === 0) return null;
  const row = rows[0];

  return {
    id: row.id,
    dishId: row.dishId,
    note: row.note,
    createdById: row.createdById ?? null,
    createdByUsername: row.createdByUsername ?? null,
    createdAt: row.createdAt,
  };
}

/**
 * Delete a dish note, scoped to a family via its parent dish. Returns false
 * if not found or belonging to another family.
 */
export async function deleteDishNote(id: string, familyId: string): Promise<boolean> {
  const existing = await db.query.dishNotes.findFirst({
    where: eq(schema.dishNotes.id, id),
  });

  if (!existing) return false;

  const dish = await db.query.dishes.findFirst({
    where: and(eq(schema.dishes.id, existing.dishId), eq(schema.dishes.familyId, familyId)),
  });
  if (!dish) return false;

  await db.delete(schema.dishNotes).where(eq(schema.dishNotes.id, id));

  return true;
}
