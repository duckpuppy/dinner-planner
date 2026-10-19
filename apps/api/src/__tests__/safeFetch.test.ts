import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import dns from 'node:dns';
import http from 'node:http';
import zlib from 'node:zlib';
import type { AddressInfo } from 'node:net';
import {
  SafeFetchError,
  SsrfBlockedError,
  assertHostnameAllowed,
  createSafeFetch,
  isPrivateIP,
  safeFetch,
  type ResolvedAddress,
} from '../services/safeFetch.js';

// ---------------------------------------------------------------------------
// isPrivateIP
// ---------------------------------------------------------------------------
describe('isPrivateIP (SSRF address policy)', () => {
  it.each([
    '0.0.0.0',
    '0.1.2.3',
    '10.1.2.3',
    '100.64.0.1',
    '100.127.255.254',
    '127.0.0.1',
    '127.9.9.9',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.8',
    '192.0.2.1',
    '192.168.0.95',
    '198.18.0.1',
    '198.19.255.255',
    '198.51.100.7',
    '203.0.113.9',
    '224.0.0.1',
    '239.255.255.250',
    '240.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '[::1]',
    '0:0:0:0:0:0:0:1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'fe80::1%eth0',
    'febf::1',
    'fec0::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:192.168.1.1',
    '::ffff:c0a8:0101',
    '::ffff:169.254.169.254',
    '0:0:0:0:0:ffff:a00:1',
    '64:ff9b::7f00:1',
    '64:ff9b::a9fe:a9fe',
    '64:ff9b:1::1',
    '2002:7f00:1::1',
    '2002:a9fe:a9fe::1',
    '::7f00:1',
    '::8.8.8.8',
    '2001:db8::1',
    '2001::1',
    '100::1',
    'not-an-ip',
    '',
  ])('blocks %s', (ip) => {
    expect(isPrivateIP(ip)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '172.15.255.255',
    '172.32.0.1',
    '100.63.255.255',
    '100.128.0.1',
    '169.253.0.1',
    '192.0.3.1',
    '198.17.0.1',
    '198.20.0.1',
    '223.255.255.255',
    '::ffff:8.8.8.8',
    '::ffff:808:808',
    '64:ff9b::808:808',
    '2002:808:808::1',
    '2606:2800:21f:cb07:6820:80da:af6b:8b2c',
    '2001:4860:4860::8888',
    '2a00:1450:4001:81b::200e',
  ])('allows %s', (ip) => {
    expect(isPrivateIP(ip)).toBe(false);
  });
});

describe('assertHostnameAllowed', () => {
  it.each([
    'localhost',
    'LOCALHOST.',
    'foo.localhost',
    'printer.local',
    'db.internal',
    'nas.lan',
    'router.home.arpa',
    '127.0.0.1',
    '[::1]',
    '[::ffff:7f00:1]',
    '10.0.0.1',
  ])('rejects %s', (h) => {
    expect(() => assertHostnameAllowed(h)).toThrow(SsrfBlockedError);
  });

  it.each(['example.com', 'www.allrecipes.com', '93.184.216.34', '[2606:2800:21f::1]'])(
    'accepts %s',
    (h) => {
      expect(() => assertHostnameAllowed(h)).not.toThrow();
    }
  );
});

// ---------------------------------------------------------------------------
// Production-bound safeFetch with mocked DNS (nothing reaches the network:
// every case here is rejected before a connection is made)
// ---------------------------------------------------------------------------
describe('safeFetch (production policy)', () => {
  afterEach(() => vi.restoreAllMocks());

  function mockDns(addrs: ResolvedAddress[] | Error) {
    const spy = vi.spyOn(dns.promises, 'lookup');
    if (addrs instanceof Error) spy.mockRejectedValue(addrs);
    else spy.mockResolvedValue(addrs as never);
    return spy;
  }

  it('blocks a hostname resolving to a private address (end to end)', async () => {
    mockDns([{ address: '192.168.0.95', family: 4 }]);
    await expect(safeFetch('https://example.com/')).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('blocks when ANY resolved address is private (mixed public + private)', async () => {
    mockDns([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ]);
    await expect(safeFetch('https://example.com/')).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('blocks when an IPv6 record is private', async () => {
    mockDns([
      { address: '2606:2800:21f:cb07:6820:80da:af6b:8b2c', family: 6 },
      { address: '::ffff:127.0.0.1', family: 6 },
    ]);
    await expect(safeFetch('https://example.com/')).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('reports DNS failure', async () => {
    mockDns(new Error('ENOTFOUND'));
    await expect(safeFetch('https://example.com/')).rejects.toThrow('Could not resolve hostname');
  });

  it('blocks IP literals without consulting DNS', async () => {
    const spy = mockDns([{ address: '93.184.216.34', family: 4 }]);
    for (const u of [
      'https://127.0.0.1/',
      'http://169.254.169.254/latest/meta-data/',
      'https://[::1]/',
      'https://[::ffff:7f00:1]/',
      'http://100.64.0.1/',
      'http://2130706433/', // decimal form, normalised by URL parser to 127.0.0.1
      'http://0x7f.1/',
    ]) {
      await expect(safeFetch(u)).rejects.toBeInstanceOf(SsrfBlockedError);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects non-http(s) schemes, credentials, and unusual ports', async () => {
    mockDns([{ address: '93.184.216.34', family: 4 }]);
    await expect(safeFetch('ftp://example.com/')).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(safeFetch('file:///etc/passwd')).rejects.toBeInstanceOf(SsrfBlockedError);
    await expect(safeFetch('https://user:pw@example.com/')).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
    await expect(safeFetch('https://example.com:6379/')).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('honours allowedProtocols', async () => {
    await expect(
      safeFetch('http://example.com/', { allowedProtocols: ['https:'] })
    ).rejects.toThrow('Only https URLs are supported');
  });
});

// ---------------------------------------------------------------------------
// Behaviour tests against a real local server. The test fetcher is built with
// createSafeFetch, using a fake resolver that maps test hostnames to addresses
// and a policy that permits ONLY 127.0.0.1 (so private/other addresses are
// still blocked exactly as in production). The production `safeFetch` export
// cannot be configured this way.
// ---------------------------------------------------------------------------
describe('safeFetch (local server)', () => {
  let server: http.Server;
  let port: number;
  const hostSeen: string[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const path = req.url ?? '/';
      hostSeen.push(String(req.headers.host));
      const redirect = (loc: string, code = 302) => {
        res.writeHead(code, { Location: loc });
        res.end();
      };
      if (path === '/ok') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html>hello</html>');
      } else if (path === '/to-metadata') redirect('http://169.254.169.254/latest/meta-data/');
      else if (path === '/to-loopback-literal') redirect('http://127.0.0.2/ok');
      else if (path === '/to-private-host') redirect(`http://internal.test:${port}/ok`);
      else if (path === '/to-mixed-host') redirect(`http://mixed.test:${port}/ok`);
      else if (path === '/to-ftp') redirect('ftp://example.com/');
      else if (path === '/relative') redirect('/ok');
      else if (path === '/relative-dotdot') redirect('../ok');
      else if (path === '/to-public') redirect(`http://public.test:${port}/ok`);
      else if (path === '/loop') redirect('/loop');
      else if (path === '/chain/3') redirect('/ok');
      else if (path.startsWith('/chain/')) redirect(`/chain/${Number(path.slice(7)) + 1}`);
      else if (path === '/big') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.write('x'.repeat(600_000));
        res.end('y'.repeat(600_000));
      } else if (path === '/big-length') {
        res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Length': '99999999' });
        res.end('tiny');
      } else if (path === '/bomb') {
        const gz = zlib.gzipSync(Buffer.alloc(5_000_000, 'a'));
        res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip' });
        res.end(gz);
      } else if (path === '/gzip') {
        res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip' });
        res.end(zlib.gzipSync('<html>zipped</html>'));
      } else if (path === '/json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      } else if (path === '/404') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end('{}');
      } else if (path === '/hang') {
        // never responds
      } else if (path === '/slow-body') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.write('start');
      } else {
        res.writeHead(500);
        res.end();
      }
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
    'mixed.test': [
      { address: '127.0.0.1', family: 4 },
      { address: '192.168.0.95', family: 4 },
    ],
  };

  const resolver = vi.fn(async (host: string) => {
    const r = TABLE[host];
    if (!r) throw new Error('ENOTFOUND');
    return r;
  });

  // Permit only the test server's loopback address; everything else uses the
  // production classifier.
  const allowTestLoopback = (a: string) => a !== '127.0.0.1' && isPrivateIP(a);
  const testFetch = createSafeFetch({
    resolve: resolver,
    isBlockedAddress: allowTestLoopback,
  });

  const base = () => `http://public.test:${port}`;
  const opts = () => ({ allowedPorts: [port] });

  afterEach(() => resolver.mockClear());

  it('fetches a page and returns status, headers, finalUrl and body', async () => {
    const res = await testFetch(`${base()}/ok`, opts());
    expect(res).toMatchObject({ status: 200, ok: true, body: '<html>hello</html>' });
    expect(res.finalUrl).toBe(`${base()}/ok`);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  it('keeps the original hostname in the Host header while connecting to the pinned IP', async () => {
    hostSeen.length = 0;
    await testFetch(`${base()}/ok`, opts());
    expect(hostSeen[0]).toBe(`public.test:${port}`);
  });

  it('sends caller headers but never a caller-supplied Host', async () => {
    let seen: http.IncomingHttpHeaders = {};
    const s = http.createServer((req, res) => {
      seen = req.headers;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('ok');
    });
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
    const p = (s.address() as AddressInfo).port;
    await testFetch(`http://public.test:${p}/`, {
      allowedPorts: [p],
      headers: { 'User-Agent': 'UA-test', Host: 'evil.example' },
    });
    await new Promise<void>((r) => s.close(() => r()));
    expect(seen['user-agent']).toBe('UA-test');
    expect(seen.host).toBe(`public.test:${p}`);
  });

  it('follows relative redirects', async () => {
    const res = await testFetch(`${base()}/relative`, opts());
    expect(res.body).toBe('<html>hello</html>');
    expect(res.finalUrl).toBe(`${base()}/ok`);
    const res2 = await testFetch(`${base()}/relative-dotdot`, opts());
    expect(res2.finalUrl).toBe(`${base()}/ok`);
  });

  it('follows a redirect to another public host (re-resolving it)', async () => {
    const res = await testFetch(`${base()}/to-public`, opts());
    expect(res.body).toBe('<html>hello</html>');
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it('blocks a redirect to the cloud metadata IP literal', async () => {
    await expect(testFetch(`${base()}/to-metadata`, opts())).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
  });

  it('blocks a redirect to a private IP literal', async () => {
    // 127.0.0.2 is loopback too; literals are checked with the production classifier
    await expect(testFetch(`${base()}/to-loopback-literal`, opts())).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
  });

  it('blocks a redirect to a hostname that resolves privately', async () => {
    await expect(testFetch(`${base()}/to-private-host`, opts())).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
  });

  it('blocks a redirect to a non-http scheme', async () => {
    await expect(testFetch(`${base()}/to-ftp`, opts())).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  it('blocks a hostname resolving to mixed public + private addresses', async () => {
    await expect(testFetch(`http://mixed.test:${port}/ok`, opts())).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
    await expect(testFetch(`${base()}/to-mixed-host`, opts())).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
  });

  it('errors when the redirect chain exceeds the limit', async () => {
    await expect(testFetch(`${base()}/loop`, opts())).rejects.toMatchObject({
      name: 'SafeFetchError',
      code: 'too_many_redirects',
    });
    // /chain/0 -> /chain/1 -> /chain/2 -> /chain/3 -> /ok = 4 redirect hops
    await expect(
      testFetch(`${base()}/chain/0`, { ...opts(), maxRedirects: 3 })
    ).rejects.toMatchObject({ code: 'too_many_redirects' });
    const ok = await testFetch(`${base()}/chain/0`, { ...opts(), maxRedirects: 4 });
    expect(ok.body).toBe('<html>hello</html>');
  });

  it('rebinding: resolves once per hop and connects only to the validated address, never re-resolving', async () => {
    // First answer is the (allowed) test address, any later answer is private.
    const answers: ResolvedAddress[][] = [
      [{ address: '127.0.0.1', family: 4 }],
      [{ address: '169.254.169.254', family: 4 }],
    ];
    const rebinding = vi.fn(
      async () => answers.shift() ?? [{ address: '169.254.169.254', family: 4 }]
    );
    const f = createSafeFetch({ resolve: rebinding, isBlockedAddress: allowTestLoopback });
    const res = await f(`http://rebind.test:${port}/ok`, opts());
    expect(res.status).toBe(200);
    expect(rebinding).toHaveBeenCalledTimes(1);
  });

  it('errors when the body exceeds maxBytes', async () => {
    await expect(
      testFetch(`${base()}/big`, { ...opts(), maxBytes: 1_000_000 })
    ).rejects.toMatchObject({ code: 'too_large' });
    const ok = await testFetch(`${base()}/big`, { ...opts(), maxBytes: 2_000_000 });
    expect(ok.body.length).toBe(1_200_000);
  });

  it('rejects early on an oversized Content-Length', async () => {
    await expect(testFetch(`${base()}/big-length`, opts())).rejects.toMatchObject({
      code: 'too_large',
    });
  });

  it('caps decompressed size (gzip bomb)', async () => {
    await expect(testFetch(`${base()}/bomb`, opts())).rejects.toMatchObject({ code: 'too_large' });
  });

  it('decompresses gzip bodies', async () => {
    const res = await testFetch(`${base()}/gzip`, opts());
    expect(res.body).toBe('<html>zipped</html>');
  });

  it('enforces allowedContentTypes on 2xx responses only', async () => {
    const allowedContentTypes = [/^text\/html\b/i];
    await expect(
      testFetch(`${base()}/json`, { ...opts(), allowedContentTypes })
    ).rejects.toMatchObject({ code: 'content_type' });
    const notFound = await testFetch(`${base()}/404`, { ...opts(), allowedContentTypes });
    expect(notFound).toMatchObject({ status: 404, ok: false });
    const ok = await testFetch(`${base()}/ok`, { ...opts(), allowedContentTypes });
    expect(ok.ok).toBe(true);
  });

  it('times out when the server never responds', async () => {
    await expect(testFetch(`${base()}/hang`, { ...opts(), timeoutMs: 200 })).rejects.toMatchObject({
      code: 'timeout',
    });
  });

  it('fails when the body stalls past the deadline', async () => {
    await expect(
      testFetch(`${base()}/slow-body`, { ...opts(), timeoutMs: 200 })
    ).rejects.toBeInstanceOf(SafeFetchError);
  });

  it('rejects ports outside the allow-list', async () => {
    await expect(testFetch(`${base()}/ok`)).rejects.toThrow('unsupported port');
  });

  it('rejects an unresolvable host', async () => {
    await expect(testFetch(`http://nope.test:${port}/`, opts())).rejects.toThrow(
      'Could not resolve hostname'
    );
  });
});
