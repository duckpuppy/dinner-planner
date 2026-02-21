/**
 * Route integration tests for dishNotes using Fastify's inject().
 * Services are mocked so no database is needed.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwtPlugin from '@fastify/jwt';
import authPlugin from '../middleware/auth.js';
import { dishNotesRoutes } from '../routes/dishNotes.js';

vi.mock('../services/dishNotes.js', () => ({
  getDishNotes: vi.fn(),
  createDishNote: vi.fn(),
  deleteDishNote: vi.fn(),
}));

import * as dishNotesService from '../services/dishNotes.js';

const TEST_JWT_SECRET = 'integration-test-secret-must-be-32-chars!';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(jwtPlugin, { secret: TEST_JWT_SECRET });
  await app.register(authPlugin);
  await app.register(dishNotesRoutes);
  await app.ready();
  return app;
}

type TestApp = Awaited<ReturnType<typeof buildApp>>;

function bearerHeader(app: TestApp) {
  const token = app.jwt.sign({ userId: 'user-1', username: 'alice', role: 'member' });
  return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(app: TestApp) {
  return {
    ...bearerHeader(app),
    'content-type': 'application/json',
  };
}

const mockNote = {
  id: 'note-1',
  dishId: 'dish-1',
  note: 'Loved it with garlic butter',
  createdById: 'user-1',
  createdByUsername: 'alice',
  createdAt: '2024-01-01T00:00:00.000Z',
};

// ===========================================================================
// GET /api/dishes/:dishId/notes
// ===========================================================================

describe('GET /api/dishes/:dishId/notes', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with empty notes array', async () => {
    vi.mocked(dishNotesService.getDishNotes).mockResolvedValueOnce([]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/dishes/dish-1/notes',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ notes: [] });
  });

  it('returns 200 with notes', async () => {
    vi.mocked(dishNotesService.getDishNotes).mockResolvedValueOnce([mockNote]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/dishes/dish-1/notes',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.notes).toHaveLength(1);
    expect(body.notes[0].id).toBe('note-1');
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/dishes/dish-1/notes',
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// POST /api/dishes/:dishId/notes
// ===========================================================================

describe('POST /api/dishes/:dishId/notes', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 201 with valid body', async () => {
    vi.mocked(dishNotesService.createDishNote).mockResolvedValueOnce(mockNote);

    const res = await app.inject({
      method: 'POST',
      url: '/api/dishes/dish-1/notes',
      headers: jsonHeaders(app),
      body: JSON.stringify({ note: 'Loved it with garlic butter' }),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBe('note-1');
    expect(body.note).toBe('Loved it with garlic butter');
    expect(body.createdByUsername).toBe('alice');
  });

  it('returns 404 when dishId does not exist', async () => {
    vi.mocked(dishNotesService.createDishNote).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'POST',
      url: '/api/dishes/nonexistent/notes',
      headers: jsonHeaders(app),
      body: JSON.stringify({ note: 'Loved it with garlic butter' }),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Dish not found' });
  });

  it('returns 400 with invalid body (empty note)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dishes/dish-1/notes',
      headers: jsonHeaders(app),
      body: JSON.stringify({ note: '' }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation error' });
  });

  it('returns 400 with note exceeding max length', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dishes/dish-1/notes',
      headers: jsonHeaders(app),
      body: JSON.stringify({ note: 'x'.repeat(2001) }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation error' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/dishes/dish-1/notes',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note: 'Test' }),
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// DELETE /api/dish-notes/:id
// ===========================================================================

describe('DELETE /api/dish-notes/:id', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 204 on success', async () => {
    vi.mocked(dishNotesService.deleteDishNote).mockResolvedValueOnce(true);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/dish-notes/note-1',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when id does not exist', async () => {
    vi.mocked(dishNotesService.deleteDishNote).mockResolvedValueOnce(false);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/dish-notes/nonexistent',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Note not found' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/dish-notes/note-1',
    });
    expect(res.statusCode).toBe(401);
  });
});
