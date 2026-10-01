/**
 * Route integration tests for standing item routes using Fastify's inject().
 * Services are mocked so no database is needed.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwtPlugin from '@fastify/jwt';
import authPlugin from '../middleware/auth.js';
import { groceryRoutes } from '../routes/grocery.js';

vi.mock('../services/standingItems.js', () => ({
  listStandingItems: vi.fn(),
  addStandingItem: vi.fn(),
  deleteStandingItem: vi.fn(),
}));

vi.mock('../services/customGroceries.js', () => ({
  addCustomItem: vi.fn(),
  updateCustomItem: vi.fn(),
  deleteCustomItem: vi.fn(),
}));

vi.mock('../services/groceryChecks.js', () => ({
  toggleCheck: vi.fn(),
  clearAllChecks: vi.fn(),
}));

vi.mock('../services/stores.js', () => ({
  listStores: vi.fn(),
}));

import * as standingItemsService from '../services/standingItems.js';

const TEST_JWT_SECRET = 'integration-test-secret-must-be-32-chars!';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(jwtPlugin, { secret: TEST_JWT_SECRET });
  await app.register(authPlugin);
  await app.register(groceryRoutes);
  await app.ready();
  return app;
}

type TestApp = Awaited<ReturnType<typeof buildApp>>;

function bearerHeader(app: TestApp) {
  const token = app.jwt.sign({
    userId: 'user-1',
    username: 'alice',
    role: 'member',
    familyId: 'family-1',
  });
  return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(app: TestApp) {
  return { ...bearerHeader(app), 'content-type': 'application/json' };
}

const mockStandingItem = {
  id: 'si-1',
  name: 'Milk',
  quantity: 2,
  unit: 'litre',
  category: 'Dairy',
  storeId: null,
  storeName: null,
};

// ===========================================================================
// GET /api/grocery/standing
// ===========================================================================

describe('GET /api/grocery/standing', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with items list', async () => {
    vi.mocked(standingItemsService.listStandingItems).mockResolvedValueOnce([mockStandingItem]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/grocery/standing',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe('si-1');
    expect(body.items[0].name).toBe('Milk');
  });

  it('returns 200 with empty array when no items', async () => {
    vi.mocked(standingItemsService.listStandingItems).mockResolvedValueOnce([]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/grocery/standing',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).items).toEqual([]);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/grocery/standing',
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// POST /api/grocery/standing
// ===========================================================================

describe('POST /api/grocery/standing', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 201 with created item', async () => {
    vi.mocked(standingItemsService.addStandingItem).mockResolvedValueOnce({
      item: mockStandingItem,
      created: true,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/grocery/standing',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: 'Milk', quantity: 2, unit: 'litre', category: 'Dairy' }),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.item.id).toBe('si-1');
    expect(body.item.name).toBe('Milk');
  });

  it('returns 201 with name only (optional fields omitted)', async () => {
    const minItem = { ...mockStandingItem, quantity: null, unit: null, category: 'Other' };
    vi.mocked(standingItemsService.addStandingItem).mockResolvedValueOnce({
      item: minItem,
      created: true,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/grocery/standing',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: 'Bread' }),
    });

    expect(res.statusCode).toBe(201);
  });

  it('returns 400 with empty name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/grocery/standing',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: '' }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation error' });
  });

  it('returns 400 when name is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/grocery/standing',
      headers: jsonHeaders(app),
      body: JSON.stringify({ quantity: 1 }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation error' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/grocery/standing',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Milk' }),
    });
    expect(res.statusCode).toBe(401);
  });

  it('passes userId from JWT to service', async () => {
    vi.mocked(standingItemsService.addStandingItem).mockResolvedValueOnce({
      item: mockStandingItem,
      created: true,
    });

    await app.inject({
      method: 'POST',
      url: '/api/grocery/standing',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: 'Milk' }),
    });

    expect(standingItemsService.addStandingItem).toHaveBeenCalledWith(
      'Milk',
      null,
      null,
      'Other',
      undefined,
      'user-1',
      'family-1',
      undefined
    );
  });
});

// ===========================================================================
// DELETE /api/grocery/standing/:id
// ===========================================================================

describe('POST /api/grocery/standing idempotent ids', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  const post = (body: unknown) =>
    app.inject({
      method: 'POST',
      url: '/api/grocery/standing',
      headers: jsonHeaders(app),
      body: JSON.stringify(body),
    });

  it('returns 200 with the existing item on a replayed id', async () => {
    vi.mocked(standingItemsService.addStandingItem).mockResolvedValueOnce({
      item: mockStandingItem,
      created: false,
    });
    const res = await post({ id: '11111111-1111-4111-8111-111111111111', name: 'Other' });
    expect(res.statusCode).toBe(200);
    expect(standingItemsService.addStandingItem).toHaveBeenLastCalledWith(
      'Other',
      null,
      null,
      'Other',
      undefined,
      'user-1',
      'family-1',
      '11111111-1111-4111-8111-111111111111'
    );
  });

  it('returns 404 when the id belongs to another family', async () => {
    vi.mocked(standingItemsService.addStandingItem).mockResolvedValueOnce(null);
    const res = await post({ id: '11111111-1111-4111-8111-111111111111', name: 'Milk' });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 with an invalid uuid id', async () => {
    const res = await post({ id: 'nope', name: 'Milk' });
    expect(res.statusCode).toBe(400);
  });
});

describe('DELETE /api/grocery/standing/:id', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 204 on success', async () => {
    vi.mocked(standingItemsService.deleteStandingItem).mockResolvedValueOnce({ deleted: true });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/grocery/standing/si-1',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(204);
  });

  it('returns 204 (idempotent) when item does not exist', async () => {
    vi.mocked(standingItemsService.deleteStandingItem).mockResolvedValueOnce({ deleted: false });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/grocery/standing/nonexistent',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(204);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/grocery/standing/si-1',
    });
    expect(res.statusCode).toBe(401);
  });
});
