import crypto from 'crypto';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

export type EventLevel = 'info' | 'warn' | 'error';
export type EventCategory = 'auth' | 'admin' | 'video' | 'cleanup' | 'system';

export interface LogEventInput {
  level: EventLevel;
  category: EventCategory;
  message: string;
  details?: Record<string, unknown>;
  userId?: string;
}

export interface EventQueryInput {
  limit?: number;
  offset?: number;
  level?: EventLevel;
  category?: EventCategory;
  search?: string;
  startDate?: string; // ISO date string
  endDate?: string; // ISO date string
}

export interface AppEvent {
  id: string;
  level: EventLevel;
  category: EventCategory;
  message: string;
  details: Record<string, unknown> | null;
  userId: string | null;
  user: { id: string; displayName: string } | null;
  createdAt: string;
}

export interface EventStats {
  total: number;
  byLevel: Record<EventLevel, number>;
  byCategory: Record<EventCategory, number>;
  last24h: number;
  last7d: number;
}

export async function logEvent(input: LogEventInput): Promise<void> {
  const { level, category, message, details, userId } = input;
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await db.insert(schema.appEvents).values({
    id,
    level,
    category,
    message,
    details: details !== undefined ? JSON.stringify(details) : null,
    userId: userId ?? null,
    createdAt,
  });

  // Mirror to Docker logs
  if (level === 'error') {
    console.error(`[${category}] ${message}`, details ?? '');
  } else if (level === 'warn') {
    console.warn(`[${category}] ${message}`, details ?? '');
  } else {
    console.log(`[${category}] ${message}`, details ?? '');
  }
}

export async function listEvents(
  query: EventQueryInput
): Promise<{ events: AppEvent[]; total: number }> {
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;

  const conditions = [];

  if (query.level) {
    conditions.push(eq(schema.appEvents.level, query.level));
  }
  if (query.category) {
    conditions.push(eq(schema.appEvents.category, query.category));
  }
  if (query.search) {
    conditions.push(
      sql`LOWER(${schema.appEvents.message}) LIKE LOWER(${'%' + query.search + '%'})`
    );
  }
  if (query.startDate) {
    conditions.push(gte(schema.appEvents.createdAt, query.startDate));
  }
  if (query.endDate) {
    conditions.push(lte(schema.appEvents.createdAt, query.endDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Count query
  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.appEvents)
    .where(whereClause);
  const total = countRows[0]?.count ?? 0;

  // Paginated rows with optional user join
  const rows = await db
    .select({
      id: schema.appEvents.id,
      level: schema.appEvents.level,
      category: schema.appEvents.category,
      message: schema.appEvents.message,
      details: schema.appEvents.details,
      userId: schema.appEvents.userId,
      createdAt: schema.appEvents.createdAt,
      userDisplayName: schema.users.displayName,
    })
    .from(schema.appEvents)
    .leftJoin(schema.users, eq(schema.appEvents.userId, schema.users.id))
    .where(whereClause)
    .orderBy(desc(schema.appEvents.createdAt))
    .limit(limit)
    .offset(offset);

  const events: AppEvent[] = rows.map((row) => ({
    id: row.id,
    level: row.level as EventLevel,
    category: row.category as EventCategory,
    message: row.message,
    details: row.details ? (JSON.parse(row.details) as Record<string, unknown>) : null,
    userId: row.userId,
    user:
      row.userId && row.userDisplayName
        ? { id: row.userId, displayName: row.userDisplayName }
        : null,
    createdAt: row.createdAt,
  }));

  return { events, total };
}

export async function getEventStats(): Promise<EventStats> {
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Total + group by level in one query
  const levelRows = await db
    .select({
      level: schema.appEvents.level,
      count: sql<number>`count(*)`,
    })
    .from(schema.appEvents)
    .groupBy(schema.appEvents.level);

  // Group by category
  const categoryRows = await db
    .select({
      category: schema.appEvents.category,
      count: sql<number>`count(*)`,
    })
    .from(schema.appEvents)
    .groupBy(schema.appEvents.category);

  // Last 24h count
  const last24hRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.appEvents)
    .where(gte(schema.appEvents.createdAt, since24h));

  // Last 7d count
  const last7dRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.appEvents)
    .where(gte(schema.appEvents.createdAt, since7d));

  const byLevel: Record<EventLevel, number> = { info: 0, warn: 0, error: 0 };
  let total = 0;
  for (const row of levelRows) {
    const lvl = row.level as EventLevel;
    byLevel[lvl] = row.count;
    total += row.count;
  }

  const byCategory: Record<EventCategory, number> = {
    auth: 0,
    admin: 0,
    video: 0,
    cleanup: 0,
    system: 0,
  };
  for (const row of categoryRows) {
    const cat = row.category as EventCategory;
    byCategory[cat] = row.count;
  }

  return {
    total,
    byLevel,
    byCategory,
    last24h: last24hRows[0]?.count ?? 0,
    last7d: last7dRows[0]?.count ?? 0,
  };
}
