import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { AdminReassignUserInput } from '@dinner-planner/shared';

/**
 * Instance-wide super-admin service layer. Unlike services/families.ts and
 * services/users.ts, these queries are deliberately NOT scoped by
 * request.user.familyId -- cross-family visibility is the entire point of
 * the super-admin surface (dinner-apm epic).
 */

export interface AdminFamilySummary {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserSummary {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  familyId: string;
  familyName: string | null;
  isSuperAdmin: boolean;
}

export type ReassignUserResult =
  | { success: true; user: AdminUserSummary }
  | { success: false; code: 'user_not_found' | 'family_not_found' };

/**
 * List every family in the instance, each with a count of its members.
 */
export async function listAllFamilies(): Promise<AdminFamilySummary[]> {
  const rows = await db
    .select({
      id: schema.families.id,
      name: schema.families.name,
      createdAt: schema.families.createdAt,
      updatedAt: schema.families.updatedAt,
      memberCount: sql<number>`count(${schema.users.id})`,
    })
    .from(schema.families)
    .leftJoin(schema.users, eq(schema.users.familyId, schema.families.id))
    .groupBy(schema.families.id);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    memberCount: Number(row.memberCount ?? 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

/**
 * List every user across every family in the instance. Never includes
 * passwordHash.
 */
export async function listAllUsers(): Promise<AdminUserSummary[]> {
  const rows = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
      role: schema.users.role,
      familyId: schema.users.familyId,
      familyName: schema.families.name,
      isSuperAdmin: schema.users.isSuperAdmin,
    })
    .from(schema.users)
    .leftJoin(schema.families, eq(schema.families.id, schema.users.familyId));

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    familyId: row.familyId,
    familyName: row.familyName ?? null,
    isSuperAdmin: row.isSuperAdmin,
  }));
}

/**
 * Reassign a user's family and/or role, unconditionally (super-admin only).
 *
 * Deliberately does NOT apply services/families.ts's
 * isSoleAdminOrphaningFamily safeguard -- that guard exists to stop a user
 * from orphaning their OWN family via self-service "leave family". This
 * route is the repair path for a family that's already orphaned (zero
 * admins), so a super-admin must be able to move/promote users into and out
 * of any family regardless of that logic.
 */
export async function reassignUser(
  userId: string,
  input: AdminReassignUserInput
): Promise<ReassignUserResult> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });

  if (!user) {
    return { success: false, code: 'user_not_found' };
  }

  if (input.familyId !== undefined) {
    const family = await db.query.families.findFirst({
      where: eq(schema.families.id, input.familyId),
    });

    if (!family) {
      return { success: false, code: 'family_not_found' };
    }
  }

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { updatedAt: now };
  if (input.familyId !== undefined) updateData.familyId = input.familyId;
  if (input.role !== undefined) updateData.role = input.role;

  await db.update(schema.users).set(updateData).where(eq(schema.users.id, userId));

  const updated = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
  });
  const family = updated
    ? await db.query.families.findFirst({ where: eq(schema.families.id, updated.familyId) })
    : null;

  return {
    success: true,
    user: {
      id: updated!.id,
      username: updated!.username,
      displayName: updated!.displayName,
      role: updated!.role,
      familyId: updated!.familyId,
      familyName: family?.name ?? null,
      isSuperAdmin: updated!.isSuperAdmin,
    },
  };
}
