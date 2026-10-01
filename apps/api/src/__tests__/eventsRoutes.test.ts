/**
 * SSE route tests against a real listening server (fetch stream reader).
 * The grocery check service is mocked so no database is needed; the real
 * grocery PUT route publishes to the real event bus.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwtPlugin from '@fastify/jwt';
import authPlugin from '../middleware/auth.js';
import { buildCorsOptions } from '../cors.js';
import { eventsRoutes } from '../routes/events.js';
import { groceryRoutes } from '../routes/grocery.js';
import { eventBus, resetEventBus } from '../services/eventBus.js';
import { INSTANCE_ID } from '../instanceId.js';

vi.mock('../services/groceryChecks.js', () => ({
  toggleCheck: vi.fn(),
  clearAllChecks: vi.fn(),
  clampClientTime: (t: number) => t,
  setCheck: vi.fn(async (args: { itemKey: string; checked: boolean; clientUpdatedAt: number }) => ({
    check: {
      itemKey: args.itemKey,
      checked: args.checked,
      updatedAt: args.clientUpdatedAt,
      checkedBy: { id: 'user-1', displayName: 'Alice' },
    },
    changed: true,
  })),
  clearChecks: vi.fn(),
}));
vi.mock('../services/customGroceries.js', () => ({
  addCustomItem: vi.fn(),
  updateCustomItem: vi.fn(),
  deleteCustomItem: vi.fn(),
}));
vi.mock('../services/standingItems.js', () => ({
  listStandingItems: vi.fn(),
  addStandingItem: vi.fn(),
  deleteStandingItem: vi.fn(),
}));
vi.mock('../services/stores.js', () => ({ listStores: vi.fn() }));

const SECRET = 'integration-test-secret-must-be-32-chars!';

async function buildApp(heartbeatMs = 25_000) {
  const app = Fastify({ logger: false });
  await app.register(helmet);
  await app.register(cors, buildCorsOptions(['https://localhost']));
  await app.register(cookie);
  await app.register(jwtPlugin, { secret: SECRET });
  await app.register(authPlugin);
  await app.register(eventsRoutes, { heartbeatMs });
  await app.register(groceryRoutes);
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { app, base: `http://127.0.0.1:${port}` };
}

type Built = Awaited<ReturnType<typeof buildApp>>;

function token(app: Built['app'], familyId = 'family-1', expiresIn?: number) {
  return app.jwt.sign(
    { userId: 'user-1', username: 'alice', role: 'member', familyId, isSuperAdmin: false },
    expiresIn ? { expiresIn } : undefined
  );
}

interface Stream {
  res: Response;
  text: () => string;
  waitFor: (needle: string, ms?: number) => Promise<void>;
  done: Promise<void>;
  cancel: () => Promise<void>;
}

interface OpenOpts {
  familyId?: string;
  headers?: Record<string, string>;
  query?: string;
  expiresIn?: number;
}

async function openStream(built: Built, opts: OpenOpts = {}): Promise<Stream> {
  const res = await fetch(`${built.base}/api/events${opts.query ?? ''}`, {
    headers: {
      Authorization: `Bearer ${token(built.app, opts.familyId, opts.expiresIn)}`,
      ...opts.headers,
    },
  });
  let buf = '';
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  const waiters: Array<() => void> = [];
  const done = (async () => {
    if (!reader) return;
    try {
      for (;;) {
        const { value, done: d } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        waiters.forEach((w) => w());
      }
    } catch {
      // cancelled
    }
    waiters.forEach((w) => w());
  })();
  const waitFor = (needle: string, ms = 3000) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timeout waiting for ${needle}; got: ${buf}`)),
        ms
      );
      const check = () => {
        if (buf.includes(needle)) {
          clearTimeout(timer);
          resolve();
        }
      };
      waiters.push(check);
      check();
    });
  return {
    res,
    text: () => buf,
    waitFor,
    done,
    cancel: async () => {
      await reader?.cancel().catch(() => undefined);
    },
  };
}

async function putCheck(built: Built, familyId = 'family-1') {
  return fetch(`${built.base}/api/grocery/checks`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token(built.app, familyId)}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      weekDate: '2026-02-24',
      itemKey: 'flour::cup',
      itemName: 'Flour',
      checked: true,
      clientUpdatedAt: 12345,
    }),
  });
}

const timeout = (ms: number, msg: string) =>
  new Promise<never>((_, rej) => setTimeout(() => rej(new Error(msg)), ms));

describe('GET /api/events', () => {
  let built: Built;
  const streams: Stream[] = [];
  const open = async (opts?: OpenOpts) => {
    const s = await openStream(built, opts);
    streams.push(s);
    return s;
  };

  beforeEach(async () => {
    resetEventBus();
    built = await buildApp();
  });

  afterEach(async () => {
    await Promise.all(streams.splice(0).map((s) => s.cancel()));
    await built.app.close();
  });

  it('returns 401 without a token', async () => {
    const res = await fetch(`${built.base}/api/events`);
    expect(res.status).toBe(401);
  });

  it('streams SSE headers, retry hint and grocery.check from another request', async () => {
    const s = await open();
    expect(s.res.status).toBe(200);
    expect(s.res.headers.get('content-type')).toContain('text/event-stream');
    expect(s.res.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(s.res.headers.get('x-accel-buffering')).toBe('no');
    expect(s.res.headers.get('content-encoding')).toBeNull();
    await s.waitFor('retry: 3000');

    expect((await putCheck(built)).status).toBe(200);
    await s.waitFor('event: grocery.check');
    await s.waitFor('"updatedAt":12345');
    const text = s.text();
    expect(text).toContain(`id: ${INSTANCE_ID}:1`);
    const data = text.split('data: ').pop()!.split('\n')[0];
    expect(JSON.parse(data)).toEqual({
      weekDate: '2026-02-24',
      itemKey: 'flour::cup',
      checked: true,
      updatedAt: 12345,
      checkedBy: { id: 'user-1', displayName: 'Alice' },
    });
  });

  it("does not deliver another family's events", async () => {
    const other = await open({ familyId: 'family-2' });
    const mine = await open({ familyId: 'family-1' });
    await other.waitFor('retry: 3000');
    await mine.waitFor('retry: 3000');
    await putCheck(built, 'family-1');
    await mine.waitFor('grocery.check');
    await new Promise((r) => setTimeout(r, 150));
    expect(other.text()).not.toContain('grocery.check');
  });

  it('sends heartbeat pings', async () => {
    await built.app.close();
    built = await buildApp(40);
    const s = await open();
    await s.waitFor(': ping');
  });

  it('replays events after Last-Event-ID (header and query param)', async () => {
    const e1 = eventBus.publish('family-1', 'pantry.add', { id: 'a' });
    eventBus.publish('family-1', 'pantry.add', { id: 'b' });
    eventBus.publish('family-1', 'pantry.delete', { id: 'a' });

    const viaHeader = await open({ headers: { 'Last-Event-ID': e1.id } });
    await viaHeader.waitFor('event: pantry.delete');
    expect(viaHeader.text()).toContain('"id":"b"');
    expect(viaHeader.text()).not.toContain('event: reset');
    expect(viaHeader.text().match(/event: pantry\.add/g)).toHaveLength(1);

    const viaQuery = await open({ query: `?lastEventId=${encodeURIComponent(e1.id)}` });
    await viaQuery.waitFor('event: pantry.delete');
    expect(viaQuery.text().match(/event: pantry\.add/g)).toHaveLength(1);
  });

  it('sends reset for unknown or other-instance Last-Event-ID', async () => {
    eventBus.publish('family-1', 'pantry.add', { id: 'a' });
    const foreign = await open({ headers: { 'Last-Event-ID': 'some-old-instance:7' } });
    await foreign.waitFor('event: reset\ndata:\n\n');
    expect(foreign.text()).not.toContain('pantry.add');

    const unknown = await open({ headers: { 'Last-Event-ID': `${INSTANCE_ID}:9999` } });
    await unknown.waitFor('event: reset');
  });

  it('ends the stream when the access token expires', async () => {
    const s = await open({ expiresIn: 1 });
    await s.waitFor('retry: 3000');
    await Promise.race([s.done, timeout(3000, 'stream did not end')]);
  });

  it('ends open streams promptly on fastify.close() and unsubscribes', async () => {
    const s = await open();
    await s.waitFor('retry: 3000');
    expect(eventBus.subscriberCount('family-1')).toBe(1);
    const started = Date.now();
    await built.app.close();
    await Promise.race([s.done, timeout(2000, 'stream did not end')]);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(eventBus.subscriberCount()).toBe(0);
    // afterEach closes `built`; give it a live app to close.
    built = await buildApp();
  });

  it('unsubscribes when the client disconnects', async () => {
    const s = await open();
    await s.waitFor('retry: 3000');
    expect(eventBus.subscriberCount('family-1')).toBe(1);
    await s.cancel();
    for (let i = 0; i < 40 && eventBus.subscriberCount() > 0; i++) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(eventBus.subscriberCount()).toBe(0);
  });

  it('carries CORS and helmet headers through the hijacked response', async () => {
    const s = await open({ headers: { Origin: 'https://localhost' } });
    expect(s.res.status).toBe(200);
    expect(s.res.headers.get('access-control-allow-origin')).toBe('https://localhost');
    expect(s.res.headers.get('access-control-allow-credentials')).toBe('true');
    expect(s.res.headers.get('vary')).toContain('Origin');
    expect(s.res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(s.res.headers.get('content-type')).toContain('text/event-stream');
  });

  it('does not grant CORS to an unlisted origin', async () => {
    const s = await open({ headers: { Origin: 'https://evil.example' } });
    expect(s.res.headers.get('access-control-allow-origin')).toBeNull();
  });
});
