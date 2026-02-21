/**
 * Route integration tests for prepTasks using Fastify's inject().
 * Services are mocked so no database is needed.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwtPlugin from '@fastify/jwt';
import authPlugin from '../middleware/auth.js';
import { prepTasksRoutes } from '../routes/prepTasks.js';

vi.mock('../services/prepTasks.js', () => ({
  getPrepTasksForEntry: vi.fn(),
  createPrepTask: vi.fn(),
  updatePrepTask: vi.fn(),
  deletePrepTask: vi.fn(),
}));

import * as prepTasksService from '../services/prepTasks.js';

const TEST_JWT_SECRET = 'integration-test-secret-must-be-32-chars!';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(jwtPlugin, { secret: TEST_JWT_SECRET });
  await app.register(authPlugin);
  await app.register(prepTasksRoutes);
  await app.ready();
  return app;
}

type TestApp = Awaited<ReturnType<typeof buildApp>>;

function bearerHeader(app: TestApp) {
  const token = app.jwt.sign({ userId: 'user-1', username: 'testuser', role: 'member' });
  return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(app: TestApp) {
  return {
    ...bearerHeader(app),
    'content-type': 'application/json',
  };
}

const mockPrepTask = {
  id: 'task-1',
  entryId: 'entry-1',
  description: 'Chop vegetables',
  completed: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

// ===========================================================================
// GET /api/entries/:entryId/prep-tasks
// ===========================================================================

describe('GET /api/entries/:entryId/prep-tasks', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with empty prepTasks array', async () => {
    vi.mocked(prepTasksService.getPrepTasksForEntry).mockResolvedValueOnce([]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/entries/entry-1/prep-tasks',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ prepTasks: [] });
  });

  it('returns 200 with prep tasks', async () => {
    vi.mocked(prepTasksService.getPrepTasksForEntry).mockResolvedValueOnce([mockPrepTask]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/entries/entry-1/prep-tasks',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.prepTasks).toHaveLength(1);
    expect(body.prepTasks[0].id).toBe('task-1');
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/entries/entry-1/prep-tasks',
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// POST /api/entries/:entryId/prep-tasks
// ===========================================================================

describe('POST /api/entries/:entryId/prep-tasks', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 201 with valid body', async () => {
    vi.mocked(prepTasksService.createPrepTask).mockResolvedValueOnce(mockPrepTask);

    const res = await app.inject({
      method: 'POST',
      url: '/api/entries/entry-1/prep-tasks',
      headers: jsonHeaders(app),
      body: JSON.stringify({ description: 'Chop vegetables' }),
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.id).toBe('task-1');
    expect(body.description).toBe('Chop vegetables');
  });

  it('returns 404 when entryId does not exist', async () => {
    vi.mocked(prepTasksService.createPrepTask).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'POST',
      url: '/api/entries/nonexistent/prep-tasks',
      headers: jsonHeaders(app),
      body: JSON.stringify({ description: 'Chop vegetables' }),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Entry not found' });
  });

  it('returns 400 with invalid body (empty description)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/entries/entry-1/prep-tasks',
      headers: jsonHeaders(app),
      body: JSON.stringify({ description: '' }),
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Validation error' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/entries/entry-1/prep-tasks',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'Test' }),
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// PATCH /api/prep-tasks/:id
// ===========================================================================

describe('PATCH /api/prep-tasks/:id', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with valid body', async () => {
    const updated = { ...mockPrepTask, completed: true };
    vi.mocked(prepTasksService.updatePrepTask).mockResolvedValueOnce(updated);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/prep-tasks/task-1',
      headers: jsonHeaders(app),
      body: JSON.stringify({ completed: true }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.completed).toBe(true);
  });

  it('returns 404 when id does not exist', async () => {
    vi.mocked(prepTasksService.updatePrepTask).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/prep-tasks/nonexistent',
      headers: jsonHeaders(app),
      body: JSON.stringify({ completed: true }),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Prep task not found' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/prep-tasks/task-1',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ completed: true }),
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// DELETE /api/prep-tasks/:id
// ===========================================================================

describe('DELETE /api/prep-tasks/:id', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 204 on success', async () => {
    vi.mocked(prepTasksService.deletePrepTask).mockResolvedValueOnce(true);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/prep-tasks/task-1',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(204);
  });

  it('returns 404 when id does not exist', async () => {
    vi.mocked(prepTasksService.deletePrepTask).mockResolvedValueOnce(false);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/prep-tasks/nonexistent',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Prep task not found' });
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/prep-tasks/task-1',
    });
    expect(res.statusCode).toBe(401);
  });
});
