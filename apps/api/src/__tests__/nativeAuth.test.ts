/**
 * Native (Capacitor) auth + cross-origin support.
 *
 * Runs the real auth routes and service against a real in-memory SQLite DB
 * (schema built from the drizzle migrations) so sliding expiry and expired
 * token rejection are exercised for real, not through mocks.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwtPlugin from '@fastify/jwt';
import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';

const dbHolder = vi.hoisted(() => ({ db: undefined as unknown, sqlite: undefined as unknown }));

vi.mock('../db/index.js', async () => {
  const { default: Database } = await import('better-sqlite3');
  const { drizzle } = await import('drizzle-orm/better-sqlite3');
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
  const schema = await import('../db/schema.js');
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = OFF');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: resolve(__dirname, '../../drizzle') });
  sqlite.pragma('foreign_keys = ON');
  dbHolder.db = db;
  dbHolder.sqlite = sqlite;
  return { db, schema, sqlite };
});

import { db, schema } from '../db/index.js';
import { hashPassword } from '../services/auth.js';
import { authRoutes } from '../routes/auth.js';
import { buildCorsOptions } from '../cors.js';

const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const DAY = 24 * 60 * 60 * 1000;
const TEST_SECRET = 'native-auth-test-secret-must-be-32-chars!!';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(jwtPlugin, { secret: TEST_SECRET });
  app.decorate('authenticate', async () => {});
  await app.register(authRoutes);
  await app.ready();
  return app;
}

type App = Awaited<ReturnType<typeof buildApp>>;

function setCookies(res: { headers: Record<string, unknown> }): string[] {
  const v = res.headers['set-cookie'];
  if (!v) return [];
  return Array.isArray(v) ? (v as string[]) : [v as string];
}

function storedTokenExpiry(token: string): number {
  const row = db
    .select()
    .from(schema.refreshTokens)
    .where(eq(schema.refreshTokens.tokenHash, sha(token)))
    .get();
  expect(row).toBeDefined();
  return new Date(row!.expiresAt).getTime();
}

function setStoredExpiry(token: string, iso: string) {
  db.update(schema.refreshTokens)
    .set({ expiresAt: iso })
    .where(eq(schema.refreshTokens.tokenHash, sha(token)))
    .run();
}

const NATIVE = { 'x-client-platform': 'native' };

async function login(app: App, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers,
    payload: { username: 'alice', password: 'password123' },
  });
}

describe('native auth', () => {
  let app: App;

  beforeAll(async () => {
    db.insert(schema.families).values({ id: 'fam-1', name: 'Smiths' }).run();
    db.insert(schema.users)
      .values({
        id: 'user-1',
        username: 'alice',
        displayName: 'Alice',
        passwordHash: await hashPassword('password123'),
        familyId: 'fam-1',
        role: 'admin',
      })
      .run();
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    db.delete(schema.refreshTokens).run();
  });

  describe('login', () => {
    it('native: returns refreshToken in body and sets no cookie', async () => {
      const res = await login(app, NATIVE);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(typeof body.refreshToken).toBe('string');
      expect(body.refreshToken.length).toBeGreaterThan(20);
      expect(body.accessToken).toBeTruthy();
      expect(setCookies(res)).toEqual([]);
    });

    it('native: stores a 30 day expiry by default', async () => {
      const before = Date.now();
      const res = await login(app, NATIVE);
      const exp = storedTokenExpiry(res.json().refreshToken);
      expect(exp - before).toBeGreaterThan(30 * DAY - 60_000);
      expect(exp - before).toBeLessThan(30 * DAY + 60_000);
    });

    it('web: sets httpOnly cookie (7d) and does not return refreshToken in body', async () => {
      const before = Date.now();
      const res = await login(app);
      expect(res.statusCode).toBe(200);
      expect(res.json().refreshToken).toBeUndefined();
      const cookies = setCookies(res);
      expect(cookies).toHaveLength(1);
      expect(cookies[0]).toMatch(/^refreshToken=/);
      expect(cookies[0]).toMatch(/HttpOnly/i);
      expect(cookies[0]).toMatch(/SameSite=Strict/i);
      expect(cookies[0]).toMatch(/Path=\/api\/auth/);
      expect(cookies[0]).not.toMatch(/Domain=/i);
      const maxAge = Number(/Max-Age=(\d+)/i.exec(cookies[0])![1]);
      expect(maxAge).toBeGreaterThan(7 * 24 * 3600 - 60);
      expect(maxAge).toBeLessThanOrEqual(7 * 24 * 3600);

      const token = /refreshToken=([^;]+)/.exec(cookies[0])![1];
      const exp = storedTokenExpiry(token);
      expect(exp - before).toBeGreaterThan(7 * DAY - 60_000);
      expect(exp - before).toBeLessThan(7 * DAY + 60_000);
    });

    it('rejects bad credentials for native without a token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: NATIVE,
        payload: { username: 'alice', password: 'wrong-password' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().refreshToken).toBeUndefined();
    });
  });

  describe('refresh', () => {
    it('native: reads refreshToken from body, returns new access token, sets no cookie', async () => {
      const { refreshToken } = (await login(app, NATIVE)).json();
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: NATIVE,
        payload: { refreshToken },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().accessToken).toBeTruthy();
      expect(res.json().user.username).toBe('alice');
      expect(setCookies(res)).toEqual([]);
    });

    it('native: ignores the cookie and 401s without a body token', async () => {
      const { refreshToken } = (await login(app, NATIVE)).json();
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: NATIVE,
        cookies: { refreshToken },
      });
      expect(res.statusCode).toBe(401);
    });

    it('native: 400 on a malformed body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: NATIVE,
        payload: { refreshToken: 123 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('native: 401 on an unknown token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: NATIVE,
        payload: { refreshToken: 'nope' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('web: still reads the cookie and re-issues it (same value, fresh maxAge)', async () => {
      const loginRes = await login(app);
      const token = /refreshToken=([^;]+)/.exec(setCookies(loginRes)[0])![1];
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: { refreshToken: token },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().accessToken).toBeTruthy();
      const cookies = setCookies(res);
      expect(cookies).toHaveLength(1);
      expect(cookies[0]).toContain(`refreshToken=${token}`); // no rotation
      expect(Number(/Max-Age=(\d+)/i.exec(cookies[0])![1])).toBeGreaterThan(7 * 24 * 3600 - 60);
    });

    it('web: a body refreshToken is ignored (cookie only)', async () => {
      const loginRes = await login(app);
      const token = /refreshToken=([^;]+)/.exec(setCookies(loginRes)[0])![1];
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: token },
      });
      expect(res.statusCode).toBe(401);
    });

    it('web: 401 and clears the cookie for an invalid token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: { refreshToken: 'bogus' },
      });
      expect(res.statusCode).toBe(401);
      expect(setCookies(res)[0]).toMatch(/^refreshToken=;/);
    });
  });

  describe('sliding expiry', () => {
    it('native refresh moves expiresAt forward to now + 30d', async () => {
      const { refreshToken } = (await login(app, NATIVE)).json();
      const soon = new Date(Date.now() + 2 * DAY).toISOString();
      setStoredExpiry(refreshToken, soon);

      const before = Date.now();
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: NATIVE,
        payload: { refreshToken },
      });
      expect(res.statusCode).toBe(200);
      const exp = storedTokenExpiry(refreshToken);
      expect(exp).toBeGreaterThan(new Date(soon).getTime());
      expect(exp - before).toBeGreaterThan(30 * DAY - 60_000);
      expect(exp - before).toBeLessThan(30 * DAY + 60_000);
    });

    it('web refresh moves expiresAt forward to now + 7d', async () => {
      const loginRes = await login(app);
      const token = /refreshToken=([^;]+)/.exec(setCookies(loginRes)[0])![1];
      const soon = new Date(Date.now() + 1 * DAY).toISOString();
      setStoredExpiry(token, soon);

      const before = Date.now();
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: { refreshToken: token },
      });
      expect(res.statusCode).toBe(200);
      const exp = storedTokenExpiry(token);
      expect(exp).toBeGreaterThan(new Date(soon).getTime());
      expect(exp - before).toBeGreaterThan(7 * DAY - 60_000);
      expect(exp - before).toBeLessThan(7 * DAY + 60_000);
    });

    it('does not rotate: the same token keeps working and row count stays 1', async () => {
      const { refreshToken } = (await login(app, NATIVE)).json();
      for (let i = 0; i < 2; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/auth/refresh',
          headers: NATIVE,
          payload: { refreshToken },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().refreshToken).toBeUndefined();
      }
      expect(db.select().from(schema.refreshTokens).all()).toHaveLength(1);
    });

    it('still rejects an expired token (and does not extend it)', async () => {
      const { refreshToken } = (await login(app, NATIVE)).json();
      const past = new Date(Date.now() - 1000).toISOString();
      setStoredExpiry(refreshToken, past);

      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: NATIVE,
        payload: { refreshToken },
      });
      expect(res.statusCode).toBe(401);
      expect(storedTokenExpiry(refreshToken)).toBe(new Date(past).getTime());
    });

    it('still rejects an expired web token', async () => {
      const loginRes = await login(app);
      const token = /refreshToken=([^;]+)/.exec(setCookies(loginRes)[0])![1];
      setStoredExpiry(token, new Date(Date.now() - 1000).toISOString());
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        cookies: { refreshToken: token },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('logout', () => {
    it('native: revokes the token from the body, sets no cookie', async () => {
      const { refreshToken } = (await login(app, NATIVE)).json();
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: NATIVE,
        payload: { refreshToken },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: true });
      expect(setCookies(res)).toEqual([]);
      expect(db.select().from(schema.refreshTokens).all()).toHaveLength(0);

      const after = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        headers: NATIVE,
        payload: { refreshToken },
      });
      expect(after.statusCode).toBe(401);
    });

    it('native: succeeds with no body, 400 on malformed body', async () => {
      const ok = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: NATIVE });
      expect(ok.statusCode).toBe(200);
      const bad = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: NATIVE,
        payload: { refreshToken: '' },
      });
      expect(bad.statusCode).toBe(400);
    });

    it('web: revokes the cookie token and clears the cookie', async () => {
      const loginRes = await login(app);
      const token = /refreshToken=([^;]+)/.exec(setCookies(loginRes)[0])![1];
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        cookies: { refreshToken: token },
      });
      expect(res.statusCode).toBe(200);
      expect(setCookies(res)[0]).toMatch(/^refreshToken=;/);
      expect(db.select().from(schema.refreshTokens).all()).toHaveLength(0);
    });
  });
});

describe('CORS preflight', () => {
  async function preflightApp(origins: string[]) {
    const app = Fastify({ logger: false });
    await app.register(cors, buildCorsOptions(origins));
    app.post('/api/auth/login', async () => ({ ok: true }));
    await app.ready();
    return app;
  }

  const preflight = (app: Awaited<ReturnType<typeof preflightApp>>, origin: string) =>
    app.inject({
      method: 'OPTIONS',
      url: '/api/auth/login',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type,x-client-platform',
      },
    });

  it('allows https://localhost with the three headers and credentials', async () => {
    const app = await preflightApp(['http://localhost:5173', 'https://localhost']);
    const res = await preflight(app, 'https://localhost');
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://localhost');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    const allowed = String(res.headers['access-control-allow-headers']).toLowerCase();
    for (const h of ['authorization', 'content-type', 'x-client-platform']) {
      expect(allowed).toContain(h);
    }
    await app.close();
  });

  it('allows the write methods the native app uses', async () => {
    const app = await preflightApp(['https://localhost']);
    const res = await preflight(app, 'https://localhost');
    const methods = String(res.headers['access-control-allow-methods'])
      .split(',')
      .map((m) => m.trim());
    expect(methods).toEqual(expect.arrayContaining(['PUT', 'PATCH', 'DELETE']));
    await app.close();
  });

  it('still allows the web origin from the list', async () => {
    const app = await preflightApp(['http://localhost:5173', 'https://localhost']);
    const res = await preflight(app, 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    await app.close();
  });

  it('does not allow an origin outside the list', async () => {
    const app = await preflightApp(['http://localhost:5173']);
    const res = await preflight(app, 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });

  it('works with a single-origin config', async () => {
    const app = await preflightApp(['http://localhost:5173']);
    const res = await preflight(app, 'http://localhost:5173');
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    await app.close();
  });
});

describe('CORS_ORIGIN config parsing', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const load = async () => {
    vi.resetModules();
    return (await import('../config.js')).config;
  };

  it('parses a single value into a one-element array', async () => {
    vi.stubEnv('CORS_ORIGIN', 'https://dinner.example.com');
    expect((await load()).CORS_ORIGIN).toEqual(['https://dinner.example.com']);
  });

  it('parses a comma-separated list, trimming whitespace and empties', async () => {
    vi.stubEnv('CORS_ORIGIN', ' https://dinner.example.com , https://localhost,,');
    expect((await load()).CORS_ORIGIN).toEqual(['https://dinner.example.com', 'https://localhost']);
  });

  it('defaults to the vite dev origin', async () => {
    vi.stubEnv('CORS_ORIGIN', undefined as unknown as string);
    delete process.env.CORS_ORIGIN;
    expect((await load()).CORS_ORIGIN).toEqual(['http://localhost:5173']);
  });

  it('defaults JWT_REFRESH_EXPIRY_NATIVE to 30d and honours overrides', async () => {
    delete process.env.JWT_REFRESH_EXPIRY_NATIVE;
    expect((await load()).JWT_REFRESH_EXPIRY_NATIVE).toBe('30d');
    vi.stubEnv('JWT_REFRESH_EXPIRY_NATIVE', '90d');
    expect((await load()).JWT_REFRESH_EXPIRY_NATIVE).toBe('90d');
  });
});

describe('Cross-Origin-Resource-Policy on media', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    vi.unstubAllEnvs();
    for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  async function mediaApp(withHelmet: boolean) {
    const root = mkdtempSync(join(tmpdir(), 'dp-corp-'));
    tmpDirs.push(root);
    vi.stubEnv('DATABASE_URL', `file:${join(root, 'vol', 'dinner.db')}`);
    delete process.env.VIDEOS_DIR;
    delete process.env.UPLOADS_DIR;
    vi.resetModules();
    const paths = await import('../dataPaths.js');
    const { registerMediaStatic } = await import('../mediaStatic.js');
    const app = Fastify();
    if (withHelmet) await app.register(helmet);
    await registerMediaStatic(app);
    app.get('/api/ping', async () => ({ ok: true }));
    return { app, paths };
  }

  it('sets cross-origin on /uploads and /videos even with helmet defaults', async () => {
    const { app, paths } = await mediaApp(true);
    writeFileSync(join(paths.UPLOADS_DIR, 'a.png'), 'img');
    writeFileSync(join(paths.VIDEOS_DIR, 'v.jpg'), 'img');
    const up = await app.inject({ method: 'GET', url: '/uploads/a.png' });
    expect(up.statusCode).toBe(200);
    expect(up.headers['cross-origin-resource-policy']).toBe('cross-origin');
    const vid = await app.inject({ method: 'GET', url: '/videos/v.jpg' });
    expect(vid.headers['cross-origin-resource-policy']).toBe('cross-origin');
    await app.close();
  });

  it('leaves helmet defaults on everything else', async () => {
    const { app } = await mediaApp(true);
    const res = await app.inject({ method: 'GET', url: '/api/ping' });
    expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    await app.close();
  });
});
