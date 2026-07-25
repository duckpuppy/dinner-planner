/**
 * Route integration tests for families using Fastify's inject().
 * Services are mocked so no database is needed.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwtPlugin from '@fastify/jwt';
import authPlugin from '../middleware/auth.js';
import { familiesRoutes } from '../routes/families.js';

vi.mock('../services/families.js', () => ({
  getFamilyById: vi.fn(),
  createFamily: vi.fn(),
  updateFamily: vi.fn(),
}));

import * as familiesService from '../services/families.js';

const TEST_JWT_SECRET = 'integration-test-secret-must-be-32-chars!';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(jwtPlugin, { secret: TEST_JWT_SECRET });
  await app.register(authPlugin);
  await app.register(familiesRoutes);
  await app.ready();
  return app;
}

type TestApp = Awaited<ReturnType<typeof buildApp>>;

function memberHeader(app: TestApp, userId = 'user-1', familyId = 'family-1') {
  const token = app.jwt.sign({ userId, username: 'alice', role: 'member', familyId });
  return { Authorization: `Bearer ${token}` };
}

function adminHeader(app: TestApp, userId = 'admin-1', familyId = 'family-1') {
  const token = app.jwt.sign({ userId, username: 'admin', role: 'admin', familyId });
  return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(app: TestApp, role: 'member' | 'admin' = 'admin', familyId = 'family-1') {
  const base =
    role === 'admin'
      ? adminHeader(app, 'admin-1', familyId)
      : memberHeader(app, 'user-1', familyId);
  return { ...base, 'content-type': 'application/json' };
}

const mockFamily = {
  id: 'family-1',
  name: 'The Smiths',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

// ===========================================================================
// GET /api/families/me
// ===========================================================================

describe('GET /api/families/me', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with the current user own family', async () => {
    vi.mocked(familiesService.getFamilyById).mockResolvedValueOnce(mockFamily);

    const res = await app.inject({
      method: 'GET',
      url: '/api/families/me',
      headers: memberHeader(app),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).family.id).toBe('family-1');
    expect(familiesService.getFamilyById).toHaveBeenCalledWith('family-1');
  });

  it('returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/families/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when family somehow missing', async () => {
    vi.mocked(familiesService.getFamilyById).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'GET',
      url: '/api/families/me',
      headers: memberHeader(app),
    });

    expect(res.statusCode).toBe(404);
  });
});

// ===========================================================================
// POST /api/families
// ===========================================================================

describe('POST /api/families', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 201 and creates a family for the requesting user', async () => {
    vi.mocked(familiesService.createFamily).mockResolvedValueOnce(mockFamily);

    const res = await app.inject({
      method: 'POST',
      url: '/api/families',
      headers: jsonHeaders(app, 'member'),
      body: JSON.stringify({ name: 'The Smiths' }),
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).family.name).toBe('The Smiths');
    expect(familiesService.createFamily).toHaveBeenCalledWith({ name: 'The Smiths' }, 'user-1');
  });

  it('returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/families',
      headers: jsonHeaders(app, 'member'),
      body: JSON.stringify({ name: '' }),
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/families',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'The Smiths' }),
    });

    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// PATCH /api/families/:id
// ===========================================================================

describe('PATCH /api/families/:id', () => {
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

  it('returns 200 when the family admin renames their own family', async () => {
    const renamed = { ...mockFamily, name: 'New Name' };
    vi.mocked(familiesService.updateFamily).mockResolvedValueOnce(renamed);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/families/family-1',
      headers: jsonHeaders(app, 'admin', 'family-1'),
      body: JSON.stringify({ name: 'New Name' }),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).family.name).toBe('New Name');
  });

  it('returns 403 when a non-admin member tries to rename their own family', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/families/family-1',
      headers: jsonHeaders(app, 'member', 'family-1'),
      body: JSON.stringify({ name: 'New Name' }),
    });

    expect(res.statusCode).toBe(403);
    expect(familiesService.updateFamily).not.toHaveBeenCalled();
  });

  it('returns 403 when an admin from family A tries to rename family B', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/families/family-b',
      headers: jsonHeaders(app, 'admin', 'family-a'),
      body: JSON.stringify({ name: 'Hijacked' }),
    });

    expect(res.statusCode).toBe(403);
    expect(familiesService.updateFamily).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/families/family-1',
      headers: jsonHeaders(app, 'admin', 'family-1'),
      body: JSON.stringify({ name: '' }),
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when family not found', async () => {
    vi.mocked(familiesService.updateFamily).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/families/family-1',
      headers: jsonHeaders(app, 'admin', 'family-1'),
      body: JSON.stringify({ name: 'New Name' }),
    });

    expect(res.statusCode).toBe(404);
  });
});
