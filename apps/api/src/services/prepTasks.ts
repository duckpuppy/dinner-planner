import crypto from 'crypto';
import { eq, asc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { CreatePrepTaskInput, UpdatePrepTaskInput, PrepTask } from '@dinner-planner/shared';

/**
 * Resolve the family a dinner entry belongs to, via its parent weekly menu.
 * Returns null if the entry doesn't exist.
 */
async function entryFamilyId(entryId: string): Promise<string | null> {
  const row = await db
    .select({ familyId: schema.weeklyMenus.familyId })
    .from(schema.dinnerEntries)
    .innerJoin(schema.weeklyMenus, eq(schema.dinnerEntries.menuId, schema.weeklyMenus.id))
    .where(eq(schema.dinnerEntries.id, entryId))
    .limit(1);
  return row[0]?.familyId ?? null;
}

/**
 * Get all prep tasks for a dinner entry, ordered by createdAt asc, scoped to
 * a family. Returns an empty array if the entry doesn't exist or belongs to
 * another family.
 */
export async function getPrepTasksForEntry(entryId: string, familyId: string): Promise<PrepTask[]> {
  if ((await entryFamilyId(entryId)) !== familyId) return [];

  const rows = await db
    .select()
    .from(schema.prepTasks)
    .where(eq(schema.prepTasks.entryId, entryId))
    .orderBy(asc(schema.prepTasks.createdAt));

  return rows.map((row) => ({
    id: row.id,
    entryId: row.entryId,
    description: row.description,
    completed: row.completed,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

/**
 * Create a prep task for a dinner entry, scoped to a family
 */
export async function createPrepTask(
  entryId: string,
  data: CreatePrepTaskInput,
  familyId: string
): Promise<PrepTask | null> {
  if ((await entryFamilyId(entryId)) !== familyId) return null;

  const entry = await db.query.dinnerEntries.findFirst({
    where: eq(schema.dinnerEntries.id, entryId),
  });
  if (!entry) return null;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.prepTasks).values({
    id,
    entryId,
    description: data.description,
    completed: false,
    createdAt: now,
    updatedAt: now,
  });

  const row = await db.query.prepTasks.findFirst({
    where: eq(schema.prepTasks.id, id),
  });

  return {
    id: row!.id,
    entryId: row!.entryId,
    description: row!.description,
    completed: row!.completed,
    createdAt: row!.createdAt,
    updatedAt: row!.updatedAt,
  };
}

/**
 * Update a prep task, scoped to a family. Returns updated task or null if
 * not found or belonging to another family.
 */
export async function updatePrepTask(
  id: string,
  data: UpdatePrepTaskInput,
  familyId: string
): Promise<PrepTask | null> {
  const existing = await db.query.prepTasks.findFirst({
    where: eq(schema.prepTasks.id, id),
  });

  if (!existing) return null;
  if ((await entryFamilyId(existing.entryId)) !== familyId) return null;

  const updates: Partial<typeof schema.prepTasks.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (data.description !== undefined) updates.description = data.description;
  if (data.completed !== undefined) updates.completed = data.completed;

  await db.update(schema.prepTasks).set(updates).where(eq(schema.prepTasks.id, id));

  const row = await db.query.prepTasks.findFirst({
    where: eq(schema.prepTasks.id, id),
  });

  return {
    id: row!.id,
    entryId: row!.entryId,
    description: row!.description,
    completed: row!.completed,
    createdAt: row!.createdAt,
    updatedAt: row!.updatedAt,
  };
}

/**
 * Delete a prep task, scoped to a family. Returns true if deleted, false if
 * not found or belonging to another family.
 */
export async function deletePrepTask(id: string, familyId: string): Promise<boolean> {
  const existing = await db.query.prepTasks.findFirst({
    where: eq(schema.prepTasks.id, id),
  });

  if (!existing) return false;
  if ((await entryFamilyId(existing.entryId)) !== familyId) return false;

  await db.delete(schema.prepTasks).where(eq(schema.prepTasks.id, id));

  return true;
}
