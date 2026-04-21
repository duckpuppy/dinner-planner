/**
 * Route integration tests for appEvents admin routes using Fastify's inject().
 * Services are mocked so no database is needed.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwtPlugin from '@fastify/jwt';
import authPlugin from '../middleware/auth.js';
import { appEventsRoutes } from '../routes/appEvents.js';

vi.mock('../services/appEvents.js', () => ({
  logEvent: vi.fn(),
  listEvents: vi.fn(),
  getEventStats: vi.fn(),
}));

vi.mock('../services/systemHealth.js', () => ({
  getSystemHealth: vi.fn(),
}));

// Prevent better-sqlite3 from loading (auth plugin imports apiTokens which imports db)
vi.mock('../db/index.js', () => ({
  db: {},
  schema: {},
}));

import * as appEventsService from '../services/appEvents.js';
import * as systemHealthService from '../services/systemHealth.js';

const mockListEvents = vi.mocked(appEventsService.listEvents);
const mockGetEventStats = vi.mocked(appEventsService.getEventStats);
const mockGetSystemHealth = vi.mocked(systemHealthService.getSystemHealth);

const TEST_JWT_SECRET = 'integration-test-secret-must-be-32-chars!';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(jwtPlugin, { secret: TEST_JWT_SECRET });
  await app.register(authPlugin);
  await app.register(appEventsRoutes);
  await app.ready();
  return app;
}

type TestApp = Awaited<ReturnType<typeof buildApp>>;

function bearerHeader(app: TestApp, role: 'member' | 'admin' = 'member') {
  const token = app.jwt.sign({ userId: 'user-1', username: 'alice', role });
  return { Authorization: `Bearer ${token}` };
}

function adminHeader(app: TestApp) {
  return bearerHeader(app, 'admin');
}

// ===========================================================================
// GET /api/admin/events
// ===========================================================================

describe('GET /api/admin/events', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns events from service', async () => {
    const fakeResult = {
      events: [
        {
          id: 'evt-1',
          level: 'info',
          category: 'auth',
          message: 'User logged in',
          details: null,
          userId: null,
          user: null,
          createdAt: '2026-04-17T10:00:00.000Z',
        },
      ],
      total: 1,
    };
    mockListEvents.mockResolvedValue(fakeResult);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/events',
      headers: adminHeader(app),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].id).toBe('evt-1');
    expect(body.total).toBe(1);
    expect(mockListEvents).toHaveBeenCalledOnce();
  });

  it('passes query params to service', async () => {
    mockListEvents.mockResolvedValue({ events: [], total: 0 });

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/events?level=error&category=auth&search=login&limit=10&offset=5',
      headers: adminHeader(app),
    });

    expect(res.statusCode).toBe(200);
    expect(mockListEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        category: 'auth',
        search: 'login',
        limit: 10,
        offset: 5,
      })
    );
  });

  it('passes startDate and endDate to service', async () => {
    mockListEvents.mockResolvedValue({ events: [], total: 0 });

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/events?startDate=2026-04-01T00:00:00.000Z&endDate=2026-04-17T00:00:00.000Z',
      headers: adminHeader(app),
    });

    expect(res.statusCode).toBe(200);
    expect(mockListEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: '2026-04-01T00:00:00.000Z',
        endDate: '2026-04-17T00:00:00.000Z',
      })
    );
  });

  it('returns 400 for invalid level query param', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/events?level=invalid',
      headers: adminHeader(app),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 400 for invalid category query param', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/events?category=notacategory',
      headers: adminHeader(app),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 403 for non-admin user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/events',
      headers: bearerHeader(app, 'member'),
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/events',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// GET /api/admin/events/stats
// ===========================================================================

describe('GET /api/admin/events/stats', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns stats from service', async () => {
    const fakeStats = {
      total: 42,
      byLevel: { info: 30, warn: 8, error: 4 },
      byCategory: { auth: 10, admin: 5, video: 15, cleanup: 7, system: 5 },
      last24h: 7,
      last7d: 30,
    };
    mockGetEventStats.mockResolvedValue(fakeStats);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/events/stats',
      headers: adminHeader(app),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.stats).toEqual(fakeStats);
    expect(mockGetEventStats).toHaveBeenCalledOnce();
  });

  it('returns 403 for non-admin user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/events/stats',
      headers: bearerHeader(app, 'member'),
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/events/stats',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// GET /api/admin/health
// ===========================================================================

describe('GET /api/admin/health', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns health from service', async () => {
    const fakeHealth = {
      videoStorage: { usedBytes: 1024, usedMb: 0.001, limitMb: 500, percentUsed: 0 },
      videoJobs: { pending: 0, downloading: 0, complete: 5, failed: 1, total: 6 },
      cleanup: {
        lastRun: '2026-04-17T03:00:00.000Z',
        lastResult: { deletedFiles: 2, freedBytes: 512, errors: 0 },
        schedulerEnabled: true,
        schedulerConfig: 'daily at 03:00',
      },
      events: { errorsLast24h: 1, warningsLast24h: 2, errorsLast7d: 5 },
    };
    mockGetSystemHealth.mockResolvedValue(fakeHealth);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/health',
      headers: adminHeader(app),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.health).toEqual(fakeHealth);
    expect(mockGetSystemHealth).toHaveBeenCalledOnce();
  });

  it('returns 403 for non-admin user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/health',
      headers: bearerHeader(app, 'member'),
    });

    expect(res.statusCode).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/health',
    });

    expect(res.statusCode).toBe(401);
  });
});
