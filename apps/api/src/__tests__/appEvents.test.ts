/**
 * Service unit tests for appEvents (mocked db).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Mock db before importing services
// ============================================================

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
  and: vi.fn().mockReturnValue(null),
  sql: Object.assign(vi.fn().mockReturnValue(null), { join: vi.fn().mockReturnValue(null) }),
  desc: vi.fn().mockReturnValue(null),
  gte: vi.fn().mockReturnValue(null),
  lte: vi.fn().mockReturnValue(null),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    appEvents: {
      id: null,
      level: null,
      category: null,
      message: null,
      details: null,
      userId: null,
      createdAt: null,
    },
    users: {
      id: null,
      displayName: null,
    },
  },
}));

import { logEvent, listEvents, getEventStats } from '../services/appEvents.js';

// ============================================================
// Chain helpers
// ============================================================

function makeSelectChain(result: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  chain.then = (onFulfilled?: (v: unknown[]) => void) => {
    if (onFulfilled) onFulfilled(result);
    return chain;
  };
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(chain);
  chain.groupBy = vi.fn().mockReturnValue(chain);
  return chain;
}

function makeInsert() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

// ============================================================
// Fixtures
// ============================================================

function makeEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    level: 'info',
    category: 'auth',
    message: 'User logged in',
    details: null,
    userId: null,
    userDisplayName: null,
    createdAt: '2026-04-17T10:00:00.000Z',
    ...overrides,
  };
}

// ============================================================
// Setup
// ============================================================

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.insert.mockReturnValue(makeInsert());
});

// ===========================================================================
// logEvent
// ===========================================================================

describe('logEvent', () => {
  it('creates an event with correct fields', async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    mockDb.insert.mockReturnValue({ values: insertValues });

    await logEvent({ level: 'info', category: 'auth', message: 'Test event' });

    expect(mockDb.insert).toHaveBeenCalledOnce();
    const inserted = insertValues.mock.calls[0][0];
    expect(inserted.level).toBe('info');
    expect(inserted.category).toBe('auth');
    expect(inserted.message).toBe('Test event');
    expect(typeof inserted.id).toBe('string');
    expect(inserted.id).toHaveLength(36); // UUID format
    expect(typeof inserted.createdAt).toBe('string');
  });

  it('serializes details to JSON string', async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    mockDb.insert.mockReturnValue({ values: insertValues });

    await logEvent({
      level: 'warn',
      category: 'system',
      message: 'With details',
      details: { key: 'value', count: 42 },
    });

    const inserted = insertValues.mock.calls[0][0];
    expect(inserted.details).toBe('{"key":"value","count":42}');
  });

  it('works without optional fields (userId, details)', async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    mockDb.insert.mockReturnValue({ values: insertValues });

    await logEvent({ level: 'error', category: 'cleanup', message: 'Minimal event' });

    const inserted = insertValues.mock.calls[0][0];
    expect(inserted.userId).toBeNull();
    expect(inserted.details).toBeNull();
  });

  it('includes userId when provided', async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined);
    mockDb.insert.mockReturnValue({ values: insertValues });

    await logEvent({ level: 'info', category: 'admin', message: 'Admin action', userId: 'user-1' });

    const inserted = insertValues.mock.calls[0][0];
    expect(inserted.userId).toBe('user-1');
  });
});

// ===========================================================================
// listEvents
// ===========================================================================

describe('listEvents', () => {
  it('returns events in descending order', async () => {
    const row1 = makeEventRow({ id: 'evt-1', createdAt: '2026-04-17T12:00:00.000Z' });
    const row2 = makeEventRow({ id: 'evt-2', createdAt: '2026-04-17T10:00:00.000Z' });

    // count query
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 2 }]));
    // rows query
    mockDb.select.mockReturnValueOnce(makeSelectChain([row1, row2]));

    const result = await listEvents({});

    expect(result.total).toBe(2);
    expect(result.events).toHaveLength(2);
    expect(result.events[0].id).toBe('evt-1');
    expect(result.events[1].id).toBe('evt-2');
  });

  it('filters by level', async () => {
    const row = makeEventRow({ level: 'error', category: 'system', message: 'Error occurred' });

    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 1 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([row]));

    const result = await listEvents({ level: 'error' });

    expect(result.total).toBe(1);
    expect(result.events[0].level).toBe('error');
  });

  it('filters by category', async () => {
    const row = makeEventRow({ category: 'video', message: 'Video downloaded' });

    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 1 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([row]));

    const result = await listEvents({ category: 'video' });

    expect(result.total).toBe(1);
    expect(result.events[0].category).toBe('video');
  });

  it('filters by date range', async () => {
    const row = makeEventRow({ createdAt: '2026-04-15T00:00:00.000Z' });

    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 1 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([row]));

    const result = await listEvents({
      startDate: '2026-04-14T00:00:00.000Z',
      endDate: '2026-04-16T00:00:00.000Z',
    });

    expect(result.total).toBe(1);
    expect(result.events).toHaveLength(1);
  });

  it('searches by message text (case-insensitive)', async () => {
    const row = makeEventRow({ message: 'User logged in successfully' });

    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 1 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([row]));

    const result = await listEvents({ search: 'LOGGED IN' });

    expect(result.total).toBe(1);
    expect(result.events[0].message).toBe('User logged in successfully');
  });

  it('paginates with limit and offset', async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeEventRow({ id: `evt-${i + 1}`, message: `Event ${i + 1}` })
    );

    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 20 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain(rows));

    const result = await listEvents({ limit: 5, offset: 10 });

    expect(result.total).toBe(20);
    expect(result.events).toHaveLength(5);
  });

  it('returns total count alongside paginated results', async () => {
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 42 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));

    const result = await listEvents({ limit: 10, offset: 0 });

    expect(result.total).toBe(42);
    expect(result.events).toHaveLength(0);
  });

  it('includes user displayName when userId is set', async () => {
    const row = makeEventRow({
      userId: 'user-1',
      userDisplayName: 'Alice',
    });

    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 1 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([row]));

    const result = await listEvents({});

    expect(result.events[0].user).toEqual({ id: 'user-1', displayName: 'Alice' });
    expect(result.events[0].userId).toBe('user-1');
  });

  it('sets user to null when userId is null', async () => {
    const row = makeEventRow({ userId: null, userDisplayName: null });

    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 1 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([row]));

    const result = await listEvents({});

    expect(result.events[0].user).toBeNull();
    expect(result.events[0].userId).toBeNull();
  });

  it('parses details from JSON string back to object', async () => {
    const row = makeEventRow({ details: '{"foo":"bar","count":5}' });

    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 1 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([row]));

    const result = await listEvents({});

    expect(result.events[0].details).toEqual({ foo: 'bar', count: 5 });
  });
});

// ===========================================================================
// getEventStats
// ===========================================================================

describe('getEventStats', () => {
  it('returns correct counts by level and category', async () => {
    // Level rows
    mockDb.select.mockReturnValueOnce(
      makeSelectChain([
        { level: 'info', count: 10 },
        { level: 'warn', count: 3 },
        { level: 'error', count: 1 },
      ])
    );
    // Category rows
    mockDb.select.mockReturnValueOnce(
      makeSelectChain([
        { category: 'auth', count: 5 },
        { category: 'admin', count: 4 },
        { category: 'video', count: 3 },
        { category: 'cleanup', count: 2 },
        { category: 'system', count: 0 },
      ])
    );
    // last 24h
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 4 }]));
    // last 7d
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 12 }]));

    const stats = await getEventStats();

    expect(stats.total).toBe(14);
    expect(stats.byLevel).toEqual({ info: 10, warn: 3, error: 1 });
    expect(stats.byCategory).toEqual({
      auth: 5,
      admin: 4,
      video: 3,
      cleanup: 2,
      system: 0,
    });
  });

  it('returns correct 24h and 7d counts', async () => {
    // Level rows (empty)
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    // Category rows (empty)
    mockDb.select.mockReturnValueOnce(makeSelectChain([]));
    // last 24h
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 7 }]));
    // last 7d
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 45 }]));

    const stats = await getEventStats();

    expect(stats.last24h).toBe(7);
    expect(stats.last7d).toBe(45);
  });

  it('defaults missing level/category counts to 0', async () => {
    // Only some levels present
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ level: 'error', count: 2 }]));
    // Only some categories present
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ category: 'auth', count: 2 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }]));
    mockDb.select.mockReturnValueOnce(makeSelectChain([{ count: 0 }]));

    const stats = await getEventStats();

    expect(stats.byLevel.info).toBe(0);
    expect(stats.byLevel.warn).toBe(0);
    expect(stats.byLevel.error).toBe(2);
    expect(stats.byCategory.admin).toBe(0);
    expect(stats.byCategory.video).toBe(0);
  });
});
