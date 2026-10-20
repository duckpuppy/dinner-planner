import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  SafeFetchError,
  SsrfBlockedError,
  createSafeFetch,
  isPrivateIP,
  type ResolvedAddress,
} from '../services/safeFetch.js';
import {
  BROWSER_HEADERS,
  HONEST_HEADERS,
  fetchPageWithFallback,
  isBlockedResponse,
} from '../services/fetchPage.js';

describe('header profiles', () => {
  it('honest profile is a truthful app UA with no browser hints', () => {
    expect(HONEST_HEADERS['User-Agent']).toMatch(/^DinnerPlanner\/\S+ \(\+recipe import\)$/);
    expect(Object.keys(HONEST_HEADERS).some((k) => k.toLowerCase().startsWith('sec-'))).toBe(false);
  });

  it('browser profile is a complete set and leaves encoding/host to safeFetch', () => {
    const keys = Object.keys(BROWSER_HEADERS).map((k) => k.toLowerCase());
    for (const k of [
      'user-agent',
      'accept',
      'accept-language',
      'sec-fetch-dest',
      'sec-fetch-mode',
      'sec-fetch-site',
      'sec-fetch-user',
      'sec-ch-ua',
      'sec-ch-ua-mobile',
      'sec-ch-ua-platform',
      'upgrade-insecure-requests',
    ]) {
      expect(keys).toContain(k);
    }
    expect(keys).not.toContain('accept-encoding');
    expect(keys).not.toContain('host');
  });
});

describe('isBlockedResponse', () => {
  const r = (status: number, headers = {}, body = '') => ({ status, headers, body });
  it.each([401, 403, 429, 503])('blocks status %i', (s) => {
    expect(isBlockedResponse(r(s))).toBe(true);
  });
  it.each([200, 404, 410, 500, 502])('does not block status %i', (s) => {
    expect(isBlockedResponse(r(s))).toBe(false);
  });
  it('blocks cf-mitigated: challenge on any status', () => {
    expect(isBlockedResponse(r(200, { 'cf-mitigated': 'challenge' }))).toBe(true);
  });
  it('blocks challenge body markers', () => {
    expect(isBlockedResponse(r(200, {}, '<title>Just a moment...</title>'))).toBe(true);
  });
});

describe('fetchPageWithFallback (local server)', () => {
  let server: http.Server;
  let port: number;
  let seen: http.IncomingHttpHeaders[] = [];
  let mode = 'ok';
  let delayMs = 0;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      seen.push(req.headers);
      const ua = String(req.headers['user-agent'] ?? '');
      const send = (code: number, body: string, extra: Record<string, string> = {}) => {
        res.writeHead(code, { 'Content-Type': 'text/html', ...extra });
        res.end(body);
      };
      const reply = () => {
        if (req.url === '/redirect-private') {
          if (seen.length === 1) return send(403, 'no');
          res.writeHead(302, { Location: 'http://internal.test/' });
          return res.end();
        }
        switch (mode) {
          case 'block-honest':
            return ua.startsWith('DinnerPlanner/') ? send(403, 'nope') : send(200, 'ok');
          case 'block-all':
            return send(403, 'nope');
          case '404':
            return send(404, 'missing');
          case '500':
            return send(500, 'boom');
          case 'cf-200':
            return req.headers['sec-fetch-mode']
              ? send(200, 'real')
              : send(200, 'challenge body', { 'cf-mitigated': 'challenge' });
          default:
            return send(200, 'ok');
        }
      };
      if (delayMs) setTimeout(reply, delayMs);
      else reply();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  });

  const TABLE: Record<string, ResolvedAddress[]> = {
    'public.test': [{ address: '127.0.0.1', family: 4 }],
    'internal.test': [{ address: '10.0.0.5', family: 4 }],
  };
  const testFetch = createSafeFetch({
    resolve: async (h) => {
      const r = TABLE[h];
      if (!r) throw new Error('ENOTFOUND');
      return r;
    },
    isBlockedAddress: (a) => a !== '127.0.0.1' && isPrivateIP(a),
  });

  const url = (p = '/') => `http://public.test:${port}${p}`;
  const run = (p = '/', timeoutMs = 10_000) =>
    fetchPageWithFallback(url(p), { allowedPorts: [port], timeoutMs }, testFetch);

  beforeEach(() => {
    seen = [];
    delayMs = 0;
    mode = 'ok';
  });

  it('succeeds on the first attempt with the honest UA (one request)', async () => {
    const res = await run();
    expect(res).toMatchObject({ status: 200, profile: 'honest', blocked: false });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.['user-agent']).toBe(HONEST_HEADERS['User-Agent']);
  });

  it('falls back to the browser profile when the honest UA is blocked (two requests)', async () => {
    mode = 'block-honest';
    const log = vi.fn();
    const res = await fetchPageWithFallback(
      url('/secret/path'),
      { allowedPorts: [port] },
      testFetch,
      log
    );
    expect(res).toMatchObject({ status: 200, profile: 'browser', blocked: false });
    expect(seen).toHaveLength(2);
    expect(seen[1]?.['sec-fetch-mode']).toBe('navigate');
    expect(seen[1]?.['sec-ch-ua']).toBeTruthy();
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain('public.test');
    expect(logged).not.toContain('secret');
    expect(logged).not.toContain('http://');
  });

  it('reports blocked after exactly two requests when both profiles are blocked', async () => {
    mode = 'block-all';
    const res = await run();
    expect(res).toMatchObject({ status: 403, profile: 'browser', blocked: true });
    expect(seen).toHaveLength(2);
  });

  it.each(['404', '500'])('does not retry on %s', async (m) => {
    mode = m;
    const res = await run();
    expect(res.status).toBe(Number(m));
    expect(res.blocked).toBe(false);
    expect(seen).toHaveLength(1);
  });

  it('treats cf-mitigated: challenge on a 200 as blocked and falls back', async () => {
    mode = 'cf-200';
    const res = await run();
    expect(res).toMatchObject({ body: 'real', profile: 'browser', blocked: false });
    expect(seen).toHaveLength(2);
  });

  it('still blocks an SSRF redirect on the fallback request', async () => {
    await expect(run('/redirect-private')).rejects.toBeInstanceOf(SsrfBlockedError);
    expect(seen).toHaveLength(2);
  });

  it('shares one deadline across both attempts', async () => {
    mode = 'block-all';
    delayMs = 150;
    const t0 = Date.now();
    await expect(run('/', 200)).rejects.toBeInstanceOf(SafeFetchError);
    expect(Date.now() - t0).toBeLessThan(330);
  });
});
