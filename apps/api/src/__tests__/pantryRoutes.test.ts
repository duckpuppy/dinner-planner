/**
 * Route integration tests for pantry using Fastify's inject().
 * Services are mocked so no database is needed.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwtPlugin from '@fastify/jwt';
import authPlugin from '../middleware/auth.js';
import { pantryRoutes } from '../routes/pantry.js';

vi.mock('../services/pantry.js', () => ({
  listPantryItems: vi.fn(),
  createPantryItem: vi.fn(),
  updatePantryItem: vi.fn(),
  deletePantryItem: vi.fn(),
}));

import * as pantryService from '../services/pantry.js';

const TEST_JWT_SECRET = 'integration-test-secret-must-be-32-chars!';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(jwtPlugin, { secret: TEST_JWT_SECRET });
  await app.register(authPlugin);
  await app.register(pantryRoutes);
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
  ingredientName: 'Olive oil',
  quantity: 1,
  unit: 'bottle',
  expiresAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
};

// ===========================================================================
// GET /api/pantry
// ===========================================================================

describe('GET /api/pantry', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with items list', async () => {
    vi.mocked(pantryService.listPantryItems).mockResolvedValueOnce([mockItem]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/pantry',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe('item-1');
  });

  it('returns 200 with empty list', async () => {
    vi.mocked(pantryService.listPantryItems).mockResolvedValueOnce([]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/pantry',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ items: [] });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/pantry' });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// POST /api/pantry
// ===========================================================================

describe('POST /api/pantry', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 201 with created item', async () => {
    vi.mocked(pantryService.createPantryItem).mockResolvedValueOnce(mockItem);

    const res = await app.inject({
      method: 'POST',
      url: '/api/pantry',
      headers: jsonHeaders(app),
      body: JSON.stringify({ ingredientName: 'Olive oil', quantity: 1, unit: 'bottle' }),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.item.id).toBe('item-1');
    expect(body.item.ingredientName).toBe('Olive oil');
  });

  it('returns 400 with empty ingredientName', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pantry',
      headers: jsonHeaders(app),
      body: JSON.stringify({ ingredientName: '' }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation error' });
  });

  it('returns 400 with invalid expiresAt format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pantry',
      headers: jsonHeaders(app),
      body: JSON.stringify({ ingredientName: 'Salt', expiresAt: 'not-a-date' }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation error' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/pantry',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ingredientName: 'Salt' }),
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// PATCH /api/pantry/:id
// ===========================================================================

describe('PATCH /api/pantry/:id', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with updated item', async () => {
    const updated = { ...mockItem, unit: 'litre' };
    vi.mocked(pantryService.updatePantryItem).mockResolvedValueOnce(updated);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/pantry/item-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ unit: 'litre' }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.item.unit).toBe('litre');
  });

  it('returns 404 when item does not exist', async () => {
    vi.mocked(pantryService.updatePantryItem).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/pantry/nonexistent',
      headers: jsonHeaders(app),
      body: JSON.stringify({ unit: 'litre' }),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Pantry item not found' });
  });

  it('returns 400 with invalid body', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/pantry/item-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ ingredientName: '' }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation error' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/pantry/item-1',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ unit: 'g' }),
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// DELETE /api/pantry/:id
// ===========================================================================

describe('DELETE /api/pantry/:id', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 204 on success', async () => {
    vi.mocked(pantryService.deletePantryItem).mockResolvedValueOnce({ success: true });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/pantry/item-1',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when item does not exist', async () => {
    vi.mocked(pantryService.deletePantryItem).mockResolvedValueOnce({ success: false });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/pantry/nonexistent',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Pantry item not found' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/pantry/item-1',
    });
    expect(res.statusCode).toBe(401);
  });
});
