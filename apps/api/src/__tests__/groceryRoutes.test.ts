/**
 * Route integration tests for custom grocery routes using Fastify's inject().
 * Services are mocked so no database is needed.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwtPlugin from '@fastify/jwt';
import authPlugin from '../middleware/auth.js';
import { groceryRoutes } from '../routes/grocery.js';

vi.mock('../services/customGroceries.js', () => ({
  getCustomItemsForWeek: vi.fn(),
  addCustomItem: vi.fn(),
  updateCustomItem: vi.fn(),
  deleteCustomItem: vi.fn(),
}));

import * as customGroceriesService from '../services/customGroceries.js';

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
  const token = app.jwt.sign({ userId: 'user-1', username: 'alice', role: 'member' });
  return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(app: TestApp) {
  return { ...bearerHeader(app), 'content-type': 'application/json' };
}

const mockItem = {
  id: 'item-1',
  weekDate: '2026-02-24',
  name: 'Milk',
  quantity: 2,
  unit: 'litre',
  sortOrder: 0,
  createdAt: '2026-02-24T00:00:00.000Z',
};

// ===========================================================================
// POST /api/grocery/custom
// ===========================================================================

describe('POST /api/grocery/custom', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 201 with created item', async () => {
    vi.mocked(customGroceriesService.addCustomItem).mockResolvedValueOnce(mockItem);

    const res = await app.inject({
      method: 'POST',
      url: '/api/grocery/custom',
      headers: jsonHeaders(app),
      body: JSON.stringify({ weekDate: '2026-02-24', name: 'Milk', quantity: 2, unit: 'litre' }),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.item.id).toBe('item-1');
    expect(body.item.name).toBe('Milk');
    expect(body.item.quantity).toBe(2);
    expect(body.item.unit).toBe('litre');
  });

  it('returns 201 with name only (optional fields omitted)', async () => {
    const minItem = { ...mockItem, quantity: null, unit: null };
    vi.mocked(customGroceriesService.addCustomItem).mockResolvedValueOnce(minItem);

    const res = await app.inject({
      method: 'POST',
      url: '/api/grocery/custom',
      headers: jsonHeaders(app),
      body: JSON.stringify({ weekDate: '2026-02-24', name: 'Bread' }),
    });

    expect(res.statusCode).toBe(201);
  });

  it('returns 400 with empty name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/grocery/custom',
      headers: jsonHeaders(app),
      body: JSON.stringify({ weekDate: '2026-02-24', name: '' }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation error' });
  });

  it('returns 400 with invalid weekDate format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/grocery/custom',
      headers: jsonHeaders(app),
      body: JSON.stringify({ weekDate: 'not-a-date', name: 'Milk' }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation error' });
  });

  it('returns 400 when weekDate is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/grocery/custom',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: 'Milk' }),
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/grocery/custom',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ weekDate: '2026-02-24', name: 'Milk' }),
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// PATCH /api/grocery/custom/:id
// ===========================================================================

describe('PATCH /api/grocery/custom/:id', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with updated item', async () => {
    const updated = { ...mockItem, name: 'Oat Milk' };
    vi.mocked(customGroceriesService.updateCustomItem).mockResolvedValueOnce(updated);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/grocery/custom/item-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: 'Oat Milk' }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.item.name).toBe('Oat Milk');
  });

  it('returns 200 when nulling quantity', async () => {
    const updated = { ...mockItem, quantity: null };
    vi.mocked(customGroceriesService.updateCustomItem).mockResolvedValueOnce(updated);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/grocery/custom/item-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ quantity: null }),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).item.quantity).toBeNull();
  });

  it('returns 404 when item does not exist', async () => {
    vi.mocked(customGroceriesService.updateCustomItem).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/grocery/custom/nonexistent',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: 'Butter' }),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Custom grocery item not found' });
  });

  it('returns 400 with empty name', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/grocery/custom/item-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ name: '' }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation error' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/grocery/custom/item-1',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Oat Milk' }),
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// DELETE /api/grocery/custom/:id
// ===========================================================================

describe('DELETE /api/grocery/custom/:id', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 204 on success', async () => {
    vi.mocked(customGroceriesService.deleteCustomItem).mockResolvedValueOnce(true);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/grocery/custom/item-1',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when item does not exist', async () => {
    vi.mocked(customGroceriesService.deleteCustomItem).mockResolvedValueOnce(false);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/grocery/custom/nonexistent',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Custom grocery item not found' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/grocery/custom/item-1',
    });
    expect(res.statusCode).toBe(401);
  });
});
