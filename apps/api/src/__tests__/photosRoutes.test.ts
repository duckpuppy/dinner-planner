/**
 * Route integration tests for photos using Fastify's inject().
 * Services are mocked so no database or filesystem is needed.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwtPlugin from '@fastify/jwt';
import authPlugin from '../middleware/auth.js';
import { photosRoutes } from '../routes/photos.js';

vi.mock('../services/photos.js', () => ({
  getPhotosForPreparation: vi.fn(),
  uploadPhoto: vi.fn(),
  deletePhoto: vi.fn(),
}));

import * as photosService from '../services/photos.js';

const TEST_JWT_SECRET = 'integration-test-secret-must-be-32-chars!';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(jwtPlugin, { secret: TEST_JWT_SECRET });
  await app.register(authPlugin);
  await app.register(photosRoutes);
  await app.ready();
  return app;
}

type TestApp = Awaited<ReturnType<typeof buildApp>>;

function bearerHeader(app: TestApp, role: 'member' | 'admin' = 'member') {
  const token = app.jwt.sign({ userId: 'user-1', username: 'alice', role });
  return { Authorization: `Bearer ${token}` };
}

const mockPhoto = {
  id: 'photo-1',
  preparationId: 'prep-1',
  uploadedById: 'user-1',
  filename: 'abc.jpg',
  mimeType: 'image/jpeg',
  size: 1024,
  url: '/uploads/abc.jpg',
  createdAt: '2024-01-01T00:00:00.000Z',
};

// ===========================================================================
// GET /api/preparations/:id/photos
// ===========================================================================

describe('GET /api/preparations/:id/photos', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with photos list', async () => {
    vi.mocked(photosService.getPhotosForPreparation).mockResolvedValueOnce([mockPhoto]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/preparations/prep-1/photos',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.photos).toHaveLength(1);
    expect(body.photos[0].id).toBe('photo-1');
  });

  it('returns 200 with empty photos array', async () => {
    vi.mocked(photosService.getPhotosForPreparation).mockResolvedValueOnce([]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/preparations/prep-1/photos',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).photos).toHaveLength(0);
  });

  it('returns 401 without auth token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/preparations/prep-1/photos',
    });
    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// DELETE /api/photos/:id
// ===========================================================================

describe('DELETE /api/photos/:id', () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('returns 200 on successful delete', async () => {
    vi.mocked(photosService.deletePhoto).mockResolvedValueOnce(undefined);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/photos/photo-1',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });

  it('returns 401 without auth token', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/photos/photo-1',
    });
    expect(res.statusCode).toBe(401);
  });

  it('propagates 404 from service', async () => {
    vi.mocked(photosService.deletePhoto).mockRejectedValueOnce(
      Object.assign(new Error('Photo not found'), { statusCode: 404 })
    );

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/photos/photo-1',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(404);
  });

  it('propagates 403 from service', async () => {
    vi.mocked(photosService.deletePhoto).mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), { statusCode: 403 })
    );

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/photos/photo-1',
      headers: bearerHeader(app),
    });

    expect(res.statusCode).toBe(403);
  });

  it('passes isAdmin=true when role is admin', async () => {
    vi.mocked(photosService.deletePhoto).mockResolvedValueOnce(undefined);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/photos/photo-1',
      headers: bearerHeader(app, 'admin'),
    });

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(photosService.deletePhoto)).toHaveBeenCalledWith('photo-1', 'user-1', true);
  });
});
