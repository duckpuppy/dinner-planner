/**
 * Route integration tests for the instance-wide super-admin surface using
 * Fastify's inject(). Services are mocked so no database is needed.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwtPlugin from '@fastify/jwt';
import authPlugin from '../middleware/auth.js';
import { adminRoutes } from '../routes/admin.js';
import type { AdminFamilySummary } from '../services/admin.js';

vi.mock('../services/admin.js', () => ({
  listAllFamilies: vi.fn(),
  listAllUsers: vi.fn(),
  reassignUser: vi.fn(),
}));

vi.mock('../services/appEvents.js', () => ({
  logEvent: vi.fn(),
}));

import * as adminService from '../services/admin.js';

const TEST_JWT_SECRET = 'integration-test-secret-must-be-32-chars!';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(jwtPlugin, { secret: TEST_JWT_SECRET });
  await app.register(authPlugin);
  await app.register(adminRoutes);
  await app.ready();
  return app;
}

type TestApp = Awaited<ReturnType<typeof buildApp>>;

function superAdminHeader(app: TestApp, userId = 'super-1', familyId = 'family-1') {
  const token = app.jwt.sign({
    userId,
    username: 'root',
    role: 'admin',
    familyId,
    isSuperAdmin: true,
  });
  return { Authorization: `Bearer ${token}` };
}

function regularAdminHeader(app: TestApp, userId = 'admin-1', familyId = 'family-1') {
  const token = app.jwt.sign({
    userId,
    username: 'admin',
    role: 'admin',
    familyId,
    isSuperAdmin: false,
  });
  return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(app: TestApp, superAdmin = true) {
  const base = superAdmin ? superAdminHeader(app) : regularAdminHeader(app);
  return { ...base, 'content-type': 'application/json' };
}

const mockFamilies: AdminFamilySummary[] = [
  {
    id: 'family-1',
    name: 'The Smiths',
    memberCount: 3,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: 'family-2',
    name: 'The Joneses',
    memberCount: 0,
    createdAt: '2024-01-02',
    updatedAt: '2024-01-02',
  },
];

const mockUsers = [
  {
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    role: 'admin' as const,
    familyId: 'family-1',
    familyName: 'The Smiths',
    isSuperAdmin: false,
  },
  {
    id: 'user-2',
    username: 'bob',
    displayName: 'Bob',
    role: 'member' as const,
    familyId: 'family-2',
    familyName: 'The Joneses',
    isSuperAdmin: false,
  },
];

// ===========================================================================
// GET /api/admin/families
// ===========================================================================

describe('GET /api/admin/families', () => {
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

  it('returns 200 with all families and member counts for a super-admin', async () => {
    vi.mocked(adminService.listAllFamilies).mockResolvedValueOnce(mockFamilies);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/families',
      headers: superAdminHeader(app),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.families).toHaveLength(2);
    expect(body.families[0].memberCount).toBe(3);
  });

  it('returns 403 for a regular (non-super-) admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/families',
      headers: regularAdminHeader(app),
    });

    expect(res.statusCode).toBe(403);
    expect(adminService.listAllFamilies).not.toHaveBeenCalled();
  });

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/families' });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// GET /api/admin/users
// ===========================================================================

describe('GET /api/admin/users', () => {
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

  it('returns 200 with all users across all families for a super-admin', async () => {
    vi.mocked(adminService.listAllUsers).mockResolvedValueOnce(mockUsers);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: superAdminHeader(app),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.users).toHaveLength(2);
    expect(body.users[0]).not.toHaveProperty('passwordHash');
    expect(body.users[1].familyName).toBe('The Joneses');
  });

  it('returns 403 for a regular (non-super-) admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/users',
      headers: regularAdminHeader(app),
    });

    expect(res.statusCode).toBe(403);
    expect(adminService.listAllUsers).not.toHaveBeenCalled();
  });

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users' });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// PATCH /api/admin/users/:id
// ===========================================================================

describe('PATCH /api/admin/users/:id', () => {
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

  it('returns 200 and reassigns a user to promote them to admin', async () => {
    const updated = { ...mockUsers[0], role: 'admin' as const };
    vi.mocked(adminService.reassignUser).mockResolvedValueOnce({ success: true, user: updated });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/users/user-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ role: 'admin' }),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user.role).toBe('admin');
    expect(adminService.reassignUser).toHaveBeenCalledWith('user-1', { role: 'admin' });
  });

  it('returns 200 and moves a user into a different family', async () => {
    const updated = { ...mockUsers[1], familyId: 'family-1', familyName: 'The Smiths' };
    vi.mocked(adminService.reassignUser).mockResolvedValueOnce({ success: true, user: updated });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/users/user-2',
      headers: jsonHeaders(app),
      body: JSON.stringify({ familyId: 'family-1' }),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).user.familyId).toBe('family-1');
  });

  it('returns 403 for a regular (non-super-) admin', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/users/user-1',
      headers: jsonHeaders(app, false),
      body: JSON.stringify({ role: 'admin' }),
    });

    expect(res.statusCode).toBe(403);
    expect(adminService.reassignUser).not.toHaveBeenCalled();
  });

  it('returns 400 when neither familyId nor role is provided', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/users/user-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({}),
    });

    expect(res.statusCode).toBe(400);
    expect(adminService.reassignUser).not.toHaveBeenCalled();
  });

  it('returns 404 when the target user does not exist', async () => {
    vi.mocked(adminService.reassignUser).mockResolvedValueOnce({
      success: false,
      code: 'user_not_found',
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/users/nonexistent',
      headers: jsonHeaders(app),
      body: JSON.stringify({ role: 'admin' }),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('User not found');
  });

  it('returns 404 when the target family does not exist', async () => {
    vi.mocked(adminService.reassignUser).mockResolvedValueOnce({
      success: false,
      code: 'family_not_found',
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/users/user-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ familyId: 'nonexistent' }),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('Family not found');
  });

  it('returns 401 without token', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/users/user-1',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    });

    expect(res.statusCode).toBe(401);
  });
});
