import crypto from 'crypto';
import { eq, and, isNull } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

export const DISPLAY_KEY_PREFIX = 'dpk_';

// Don't write last_used_at on every poll of an always-on display.
const LAST_USED_THROTTLE_MS = 60_000;

export interface DisplayLinkRow {
  id: string;
  name: string;
  createdByUserId: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export function hashDisplayKey(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createDisplayLink(
  familyId: string,
  userId: string,
  name: string
): { id: string; name: string; token: string; createdAt: string } {
  const token = DISPLAY_KEY_PREFIX + crypto.randomBytes(32).toString('hex');
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.insert(schema.displayLinks)
    .values({
      id,
      familyId,
      name,
      tokenHash: hashDisplayKey(token),
      createdByUserId: userId,
      createdAt,
    })
    .run();
  return { id, name, token, createdAt };
}

/** Active (non-revoked) display links for a family. Never includes tokens. */
export function listDisplayLinks(familyId: string): DisplayLinkRow[] {
  return db
    .select({
      id: schema.displayLinks.id,
      name: schema.displayLinks.name,
      createdByUserId: schema.displayLinks.createdByUserId,
      lastUsedAt: schema.displayLinks.lastUsedAt,
      createdAt: schema.displayLinks.createdAt,
    })
    .from(schema.displayLinks)
    .where(and(eq(schema.displayLinks.familyId, familyId), isNull(schema.displayLinks.revokedAt)))
    .orderBy(schema.displayLinks.createdAt)
    .all();
}

/**
 * Revoke a display link. Returns false when it does not exist, is already
 * revoked, or belongs to another family (callers answer 404 for all three).
 */
export function revokeDisplayLink(id: string, familyId: string): boolean {
  const result = db
    .update(schema.displayLinks)
    .set({ revokedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.displayLinks.id, id),
        eq(schema.displayLinks.familyId, familyId),
        isNull(schema.displayLinks.revokedAt)
      )
    )
    .run();
  return result.changes > 0;
}

/** Resolve a raw display key to its family, or null if unknown/revoked. */
export function validateDisplayKey(token: string): { linkId: string; familyId: string } | null {
  if (!token.startsWith(DISPLAY_KEY_PREFIX)) return null;
  const row = db
    .select({
      id: schema.displayLinks.id,
      familyId: schema.displayLinks.familyId,
      lastUsedAt: schema.displayLinks.lastUsedAt,
      revokedAt: schema.displayLinks.revokedAt,
    })
    .from(schema.displayLinks)
    .where(eq(schema.displayLinks.tokenHash, hashDisplayKey(token)))
    .get();

  if (!row || row.revokedAt) return null;

  const now = Date.now();
  if (!row.lastUsedAt || now - Date.parse(row.lastUsedAt) > LAST_USED_THROTTLE_MS) {
    db.update(schema.displayLinks)
      .set({ lastUsedAt: new Date(now).toISOString() })
      .where(eq(schema.displayLinks.id, row.id))
      .run();
  }

  return { linkId: row.id, familyId: row.familyId };
}
