import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

export interface ApiTokenRow {
  id: string;
  name: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateApiToken(
  userId: string,
  name: string,
  expiresAt?: string
): { token: string; id: string } {
  const raw = 'dp_' + crypto.randomBytes(32).toString('hex');
  const id = crypto.randomUUID();
  db.insert(schema.apiTokens)
    .values({
      id,
      userId,
      name,
      tokenHash: hashToken(raw),
      expiresAt: expiresAt ?? null,
    })
    .run();
  return { token: raw, id };
}

export function validateApiToken(token: string) {
  const hash = hashToken(token);
  const row = db
    .select({
      tokenId: schema.apiTokens.id,
      expiresAt: schema.apiTokens.expiresAt,
      userId: schema.users.id,
      username: schema.users.username,
      role: schema.users.role,
    })
    .from(schema.apiTokens)
    .innerJoin(schema.users, eq(schema.apiTokens.userId, schema.users.id))
    .where(eq(schema.apiTokens.tokenHash, hash))
    .get();

  if (!row) return null;
  if (row.expiresAt && row.expiresAt < new Date().toISOString()) return null;

  db.update(schema.apiTokens)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(schema.apiTokens.tokenHash, hash))
    .run();

  return { userId: row.userId, username: row.username, role: row.role as 'admin' | 'member' };
}

export function revokeApiToken(tokenId: string, userId: string): boolean {
  const result = db
    .delete(schema.apiTokens)
    .where(and(eq(schema.apiTokens.id, tokenId), eq(schema.apiTokens.userId, userId)))
    .run();
  return result.changes > 0;
}

export function listApiTokens(userId: string): ApiTokenRow[] {
  return db
    .select({
      id: schema.apiTokens.id,
      name: schema.apiTokens.name,
      lastUsedAt: schema.apiTokens.lastUsedAt,
      expiresAt: schema.apiTokens.expiresAt,
      createdAt: schema.apiTokens.createdAt,
    })
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.userId, userId))
    .all();
}
