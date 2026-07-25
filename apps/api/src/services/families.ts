import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { CreateFamilyInput, UpdateFamilyInput } from '@dinner-planner/shared';

export interface FamilyResponse {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

function toFamilyResponse(family: typeof schema.families.$inferSelect): FamilyResponse {
  return {
    id: family.id,
    name: family.name,
    createdAt: family.createdAt,
    updatedAt: family.updatedAt,
  };
}

/**
 * Get a family by ID.
 */
export async function getFamilyById(id: string): Promise<FamilyResponse | null> {
  const family = await db.query.families.findFirst({
    where: eq(schema.families.id, id),
  });

  return family ? toFamilyResponse(family) : null;
}

/**
 * Create a new family and make the creating user its admin.
 * Used both by first-run setup and by any authenticated user who wants to
 * start a new, separate family (e.g. a second household on the same
 * instance). The creator is reassigned into the new family as admin.
 */
export async function createFamily(
  input: CreateFamilyInput,
  creatorUserId: string
): Promise<FamilyResponse> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.insert(schema.families).values({
    id,
    name: input.name,
    createdAt: now,
    updatedAt: now,
  });

  await db
    .update(schema.users)
    .set({ familyId: id, role: 'admin', updatedAt: now })
    .where(eq(schema.users.id, creatorUserId));

  const family = await db.query.families.findFirst({
    where: eq(schema.families.id, id),
  });

  return toFamilyResponse(family!);
}

/**
 * Rename a family. Scoped by the caller passing the id of their own family
 * (request.user.familyId) -- there is no cross-family access here.
 */
export async function updateFamily(
  id: string,
  input: UpdateFamilyInput
): Promise<FamilyResponse | null> {
  const family = await db.query.families.findFirst({
    where: eq(schema.families.id, id),
  });

  if (!family) {
    return null;
  }

  const now = new Date().toISOString();

  await db
    .update(schema.families)
    .set({ name: input.name, updatedAt: now })
    .where(eq(schema.families.id, id));

  const updated = await db.query.families.findFirst({
    where: eq(schema.families.id, id),
  });

  return toFamilyResponse(updated!);
}
