/**
 * Route integration tests for POST /api/setup using Fastify's inject().
 * The setup service is mocked so no database is needed.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../services/setup.js', () => ({
  isSetupRequired: vi.fn().mockResolvedValue(true),
  createFirstAdmin: vi.fn(),
}));

import * as setupService from '../services/setup.js';
import { setupRoutes } from '../routes/setup.js';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(setupRoutes);
  await app.ready();
  return app;
}

type TestApp = Awaited<ReturnType<typeof buildApp>>;

describe('POST /api/setup', () => {
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

  it('returns 201 with message on first run', async () => {
    vi.mocked(setupService.createFirstAdmin).mockResolvedValueOnce({ success: true });

    const res = await app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'password123' }),
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body)).toEqual({ message: 'Setup complete' });
    expect(setupService.createFirstAdmin).toHaveBeenCalledWith('alice', 'password123');
  });

  it('returns 404 when setup already completed', async () => {
    vi.mocked(setupService.createFirstAdmin).mockResolvedValueOnce({ success: false });

    const res = await app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'password123' }),
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: 'Setup already completed' });
  });

  it('returns 400 for username shorter than 3 characters', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'ab', password: 'password123' }),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation error');
    expect(setupService.createFirstAdmin).not.toHaveBeenCalled();
  });

  it('returns 400 for password shorter than 8 characters', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'alice', password: 'short' }),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Validation error');
    expect(setupService.createFirstAdmin).not.toHaveBeenCalled();
  });

  it('returns 400 when body is missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.statusCode).toBe(400);
    expect(setupService.createFirstAdmin).not.toHaveBeenCalled();
  });
});
