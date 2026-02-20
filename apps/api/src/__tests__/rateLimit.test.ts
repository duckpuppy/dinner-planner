/**
 * Rate limiting integration tests.
 * Uses a dedicated app that explicitly registers @fastify/rate-limit
 * (the main server skips it in NODE_ENV=test).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import jwtPlugin from '@fastify/jwt';
import authPlugin from '../middleware/auth.js';
import { authRoutes } from '../routes/auth.js';
import { dishesRoutes } from '../routes/dishes.js';

vi.mock('../services/auth.js', () => ({
  login: vi.fn().mockResolvedValue(null), // always 401 — we only care about 429
  refreshAccessToken: vi.fn().mockResolvedValue(null),
  logout: vi.fn(),
  getUserById: vi.fn(),
}));

vi.mock('../services/dishes.js', () => ({
  getDishes: vi.fn(),
  getDishById: vi.fn(),
  createDish: vi.fn(),
  updateDish: vi.fn(),
  archiveDish: vi.fn(),
  unarchiveDish: vi.fn(),
  deleteDish: vi.fn(),
  getAllTags: vi.fn(),
}));

vi.mock('../services/recipeImport.js', () => ({
  importRecipeFromUrl: vi.fn().mockResolvedValue({}),
  validateRecipeUrl: vi.fn().mockReturnValue(true),
  SsrfBlockedError: class SsrfBlockedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SsrfBlockedError';
    }
  },
}));

const TEST_SECRET = 'rate-limit-test-secret-must-be-32-chars!!';

async function buildRateLimitApp() {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, {
    global: false,
    // Use a tiny window so tests don't need to wait
  });
  await app.register(jwtPlugin, { secret: TEST_SECRET });
  await app.register(authPlugin);
  await app.register(authRoutes);
  await app.register(dishesRoutes);
  await app.ready();
  return app;
}

function authToken(app: Awaited<ReturnType<typeof buildRateLimitApp>>) {
  return `Bearer ${app.jwt.sign({ userId: 'u-1', username: 'test', role: 'member' })}`;
}

describe('Rate limiting', () => {
  describe('POST /api/auth/login', () => {
    let app: Awaited<ReturnType<typeof buildRateLimitApp>>;
    beforeAll(async () => {
      app = await buildRateLimitApp();
    });
    afterAll(async () => {
      await app.close();
    });

    it('returns 429 after 10 requests within the window', async () => {
      const body = JSON.stringify({ username: 'x', password: 'y' });
      const headers = { 'content-type': 'application/json' };

      // Exhaust the limit (10 allowed)
      for (let i = 0; i < 10; i++) {
        await app.inject({ method: 'POST', url: '/api/auth/login', headers, body });
      }

      // 11th request should be rate-limited
      const res = await app.inject({ method: 'POST', url: '/api/auth/login', headers, body });
      expect(res.statusCode).toBe(429);
    });
  });

  describe('POST /api/auth/refresh', () => {
    let app: Awaited<ReturnType<typeof buildRateLimitApp>>;
    beforeAll(async () => {
      app = await buildRateLimitApp();
    });
    afterAll(async () => {
      await app.close();
    });

    it('returns 429 after 20 requests within the window', async () => {
      for (let i = 0; i < 20; i++) {
        await app.inject({ method: 'POST', url: '/api/auth/refresh' });
      }
      const res = await app.inject({ method: 'POST', url: '/api/auth/refresh' });
      expect(res.statusCode).toBe(429);
    });
  });

  describe('POST /api/dishes/import-url', () => {
    let app: Awaited<ReturnType<typeof buildRateLimitApp>>;
    beforeAll(async () => {
      app = await buildRateLimitApp();
    });
    afterAll(async () => {
      await app.close();
    });

    it('returns 429 after 5 requests within the window', async () => {
      const body = JSON.stringify({ url: 'https://example.com/recipe' });
      const headers = {
        'content-type': 'application/json',
        authorization: authToken(app),
      };

      for (let i = 0; i < 5; i++) {
        await app.inject({ method: 'POST', url: '/api/dishes/import-url', headers, body });
      }
      const res = await app.inject({
        method: 'POST',
        url: '/api/dishes/import-url',
        headers,
        body,
      });
      expect(res.statusCode).toBe(429);
    });
  });
});
