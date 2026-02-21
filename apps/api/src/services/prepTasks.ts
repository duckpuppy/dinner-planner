import crypto from 'crypto';
import { eq, asc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { CreatePrepTaskInput, UpdatePrepTaskInput, PrepTask } from '@dinner-planner/shared';

/**
 * Get all prep tasks for a dinner entry, ordered by createdAt asc
 */
export async function getPrepTasksForEntry(entryId: string): Promise<PrepTask[]> {
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
 * Create a prep task for a dinner entry
 */
export async function createPrepTask(
  entryId: string,
  data: CreatePrepTaskInput
): Promise<PrepTask | null> {
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
 * Update a prep task. Returns updated task or null if not found.
 */
export async function updatePrepTask(
  id: string,
  data: UpdatePrepTaskInput
): Promise<PrepTask | null> {
  const existing = await db.query.prepTasks.findFirst({
    where: eq(schema.prepTasks.id, id),
  });

  if (!existing) return null;

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
 * Delete a prep task. Returns true if deleted, false if not found.
 */
export async function deletePrepTask(id: string): Promise<boolean> {
  const existing = await db.query.prepTasks.findFirst({
    where: eq(schema.prepTasks.id, id),
  });

  if (!existing) return false;

  await db.delete(schema.prepTasks).where(eq(schema.prepTasks.id, id));

  return true;
}
