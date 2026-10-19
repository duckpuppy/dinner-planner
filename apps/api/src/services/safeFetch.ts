import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import type { LookupFunction } from 'node:net';
import type { Readable } from 'node:stream';

/**
 * SSRF-hardened HTTP GET client.
 *
 * Guarantees (production policy):
 *  - Only http/https, only ports 80/443 by default.
 *  - Redirects are followed manually (bounded), and EVERY hop is re-validated.
 *  - The hostname is resolved exactly once per hop, inside the socket's `lookup`
 *    hook, and ALL returned addresses must be public. The socket connects to
 *    exactly those validated addresses, so DNS rebinding between "check" and
 *    "connect" is impossible (there is no second resolution).
 *  - The TLS SNI / Host header remain the original hostname (we pass the
 *    hostname to node:https and only override name resolution).
 *  - Response body is streamed (after decompression) with a hard byte cap and
 *    the whole operation, including all redirects, shares one deadline.
 */

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

export type SafeFetchErrorCode =
  'resolve' | 'too_many_redirects' | 'too_large' | 'content_type' | 'timeout' | 'network';

export class SafeFetchError extends Error {
  constructor(
    message: string,
    public readonly code: SafeFetchErrorCode
  ) {
    super(message);
    this.name = 'SafeFetchError';
  }
}

const BLOCKED_MESSAGE = 'URL not allowed: private or loopback addresses are blocked';

// ---------------------------------------------------------------------------
// IP classification
// ---------------------------------------------------------------------------

// [network, prefixLength]
const BLOCKED_V4: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "this network", unspecified
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast (deprecated)
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
];

function v4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

function isBlockedV4Int(n: number): boolean {
  return BLOCKED_V4.some(([net_, bits]) => {
    const base = v4ToInt(net_) as number;
    const size = 2 ** (32 - bits);
    return n >= base && n < base + size;
  });
}

/** Parse an IPv6 literal into 8 hextets, or null if malformed. */
function parseV6(input: string): number[] | null {
  let ip = input;
  const zone = ip.indexOf('%');
  if (zone !== -1) ip = ip.slice(0, zone);

  // Trailing embedded IPv4 (e.g. ::ffff:127.0.0.1)
  const lastColon = ip.lastIndexOf(':');
  if (ip.includes('.')) {
    const v4 = v4ToInt(ip.slice(lastColon + 1));
    if (v4 === null) return null;
    ip = `${ip.slice(0, lastColon + 1)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }

  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...Array<string>(missing).fill('0'), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

function hextetsMatch(h: number[], prefix: number[], bits: number): boolean {
  for (let i = 0; i < 8 && bits > 0; i++) {
    const b = Math.min(16, bits);
    const mask = (0xffff << (16 - b)) & 0xffff;
    if (((h[i] as number) & mask) !== ((prefix[i] as number) & mask)) return false;
    bits -= b;
  }
  return true;
}

function v6Prefix(...parts: number[]): number[] {
  return [...parts, ...Array<number>(8 - parts.length).fill(0)];
}

const BLOCKED_V6: ReadonlyArray<readonly [number[], number]> = [
  [v6Prefix(0, 0, 0, 0, 0, 0, 0, 0), 128], // :: unspecified
  [v6Prefix(0, 0, 0, 0, 0, 0, 0, 1), 128], // ::1 loopback
  [v6Prefix(0x64, 0xff9b, 1), 48], // local-use NAT64
  [v6Prefix(0x100), 64], // discard-only
  [v6Prefix(0x2001, 0), 23], // IETF protocol assignments incl. Teredo
  [v6Prefix(0x2001, 0x10), 28], // ORCHID
  [v6Prefix(0x2001, 0xdb8), 32], // documentation
  [v6Prefix(0xfc00), 7], // unique local
  [v6Prefix(0xfe80), 10], // link-local
  [v6Prefix(0xfec0), 10], // deprecated site-local
  [v6Prefix(0xff00), 8], // multicast
];

/**
 * Returns true if the given IP address is private, loopback, link-local,
 * CGNAT, multicast, reserved, or otherwise not a public unicast address.
 * Unparseable input is treated as blocked (fail closed).
 */
export function isPrivateIP(ip: string): boolean {
  let addr = ip.trim().toLowerCase();
  if (addr.startsWith('[') && addr.endsWith(']')) addr = addr.slice(1, -1);

  const family = net.isIP(addr);
  if (family === 4) {
    const n = v4ToInt(addr);
    return n === null ? true : isBlockedV4Int(n);
  }
  if (family === 6) {
    const h = parseV6(addr);
    if (!h) return true;
    const embeddedV4 = (): number => (((h[6] as number) << 16) | (h[7] as number)) >>> 0;
    // ::ffff:a.b.c.d (IPv4-mapped)
    if (hextetsMatch(h, v6Prefix(0, 0, 0, 0, 0, 0xffff), 96)) {
      return isBlockedV4Int(embeddedV4());
    }
    // 64:ff9b::/96 NAT64
    if (hextetsMatch(h, v6Prefix(0x64, 0xff9b), 96)) return isBlockedV4Int(embeddedV4());
    // ::/96 IPv4-compatible (deprecated) -- block wholesale, includes :: and ::1
    if (hextetsMatch(h, v6Prefix(), 96)) return true;
    // 2002::/16 6to4 embeds the IPv4 address in hextets 1-2
    if (h[0] === 0x2002) {
      return isBlockedV4Int((((h[1] as number) << 16) | (h[2] as number)) >>> 0);
    }
    return BLOCKED_V6.some(([prefix, bits]) => hextetsMatch(h, prefix, bits));
  }
  return true;
}

const BLOCKED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.localdomain',
  '.home.arpa',
  '.lan',
  '.intranet',
  '.corp',
  '.home',
];

/**
 * Static (no-network) hostname check. Throws SsrfBlockedError for localhost-ish
 * names and for IP-literal hosts in blocked ranges. Accepts bracketed IPv6.
 */
export function assertHostnameAllowed(rawHost: string): void {
  let host = rawHost.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  host = host.replace(/\.$/, '');
  if (!host) throw new SsrfBlockedError(BLOCKED_MESSAGE);
  if (host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new SsrfBlockedError(BLOCKED_MESSAGE);
  }
  if (net.isIP(host) !== 0 && isPrivateIP(host)) {
    throw new SsrfBlockedError(BLOCKED_MESSAGE);
  }
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  /** Overall deadline across all redirect hops and body read. Default 10s. */
  timeoutMs?: number;
  /** Maximum decompressed body size in bytes. Default 2 MiB. */
  maxBytes?: number;
  /** Maximum redirect hops followed. Default 5. */
  maxRedirects?: number;
  /** Allowed URL schemes, e.g. ['https:']. Default ['http:', 'https:']. */
  allowedProtocols?: string[];
  /** Allowed explicit/default ports. Default [80, 443]. */
  allowedPorts?: number[];
  /**
   * If set, a 2xx response whose Content-Type matches none of these is
   * rejected (code 'content_type') before its body is read.
   */
  allowedContentTypes?: RegExp[];
}

export interface SafeFetchResult {
  status: number;
  ok: boolean;
  headers: IncomingHttpHeaders;
  /** URL after following redirects. */
  finalUrl: string;
  body: string;
}

/**
 * Environment seam. The exported `safeFetch` is bound to the production
 * policy; `createSafeFetch` is only for tests (and takes no env/config input),
 * so production behaviour cannot be weakened by configuration.
 */
export interface SafeFetchDeps {
  resolve: Resolver;
  /** Returns true if the address must not be connected to. */
  isBlockedAddress: (address: string) => boolean;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SENSITIVE_HEADERS = ['authorization', 'cookie', 'proxy-authorization'];

const defaultResolve: Resolver = async (hostname) => {
  const res = (await dns.promises.lookup(hostname, { all: true, verbatim: true })) as
    ResolvedAddress | ResolvedAddress[];
  return Array.isArray(res) ? res : [res];
};

interface HopResponse {
  res: IncomingMessage;
}

export function createSafeFetch(deps: SafeFetchDeps) {
  function makeLookup(onError: (e: Error) => void): LookupFunction {
    return (hostname, options, callback) => {
      deps
        .resolve(hostname)
        .then(
          (addrs) => {
            if (addrs.length === 0)
              throw new SafeFetchError('Could not resolve hostname', 'resolve');
            // Reject if ANY resolved address is non-public.
            if (addrs.some((a) => deps.isBlockedAddress(a.address))) {
              throw new SsrfBlockedError(BLOCKED_MESSAGE);
            }
            const wanted = options.family === 4 || options.family === 6 ? options.family : 0;
            const usable = wanted ? addrs.filter((a) => a.family === wanted) : addrs;
            if (usable.length === 0)
              throw new SafeFetchError('Could not resolve hostname', 'resolve');
            if (options.all) {
              (callback as unknown as (e: null, a: ResolvedAddress[]) => void)(null, usable);
            } else {
              const first = usable[0] as ResolvedAddress;
              callback(null, first.address, first.family);
            }
          },
          (err: unknown) => {
            if (err instanceof SsrfBlockedError || err instanceof SafeFetchError) throw err;
            throw new SafeFetchError('Could not resolve hostname', 'resolve');
          }
        )
        .catch((err: Error) => {
          onError(err);
          callback(err, '', 4);
        });
    };
  }

  function requestOnce(
    url: URL,
    headers: Record<string, string>,
    signal: AbortSignal
  ): Promise<HopResponse> {
    return new Promise((resolve, reject) => {
      let lookupError: Error | null = null;
      const mod = url.protocol === 'https:' ? https : http;
      const hostname =
        url.hostname.startsWith('[') && url.hostname.endsWith(']')
          ? url.hostname.slice(1, -1)
          : url.hostname;
      const req = mod.request(
        {
          protocol: url.protocol,
          hostname,
          port: url.port || undefined,
          path: `${url.pathname}${url.search}`,
          method: 'GET',
          headers,
          agent: false, // no connection pooling across validated hosts
          lookup: makeLookup((e) => {
            lookupError = e;
          }),
          signal,
        },
        (res) => resolve({ res })
      );
      req.on('error', (err) => {
        if (signal.aborted) reject(new SafeFetchError('Request timed out', 'timeout'));
        else reject(lookupError ?? new SafeFetchError('Failed to fetch URL', 'network'));
        void err;
      });
      req.end();
    });
  }

  function decodeStream(res: IncomingMessage): Readable {
    const enc = String(res.headers['content-encoding'] ?? '')
      .trim()
      .toLowerCase();
    let out: Readable = res;
    if (enc === 'gzip' || enc === 'x-gzip') out = res.pipe(zlib.createGunzip());
    else if (enc === 'deflate') out = res.pipe(zlib.createInflate());
    else if (enc === 'br') out = res.pipe(zlib.createBrotliDecompress());
    if (out !== res) res.on('error', (e) => out.destroy(e));
    return out;
  }

  async function readCapped(
    res: IncomingMessage,
    maxBytes: number,
    signal: AbortSignal
  ): Promise<string> {
    const declared = res.headers['content-length'];
    if (declared && !res.headers['content-encoding'] && parseInt(declared, 10) > maxBytes) {
      res.destroy();
      throw new SafeFetchError('Response too large to process', 'too_large');
    }
    const stream = decodeStream(res);
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      for await (const chunk of stream) {
        const buf = chunk as Buffer;
        total += buf.length;
        if (total > maxBytes) {
          stream.destroy();
          res.destroy();
          throw new SafeFetchError('Response too large to process', 'too_large');
        }
        chunks.push(buf);
      }
    } catch (err) {
      res.destroy();
      if (err instanceof SafeFetchError) throw err;
      if (signal.aborted) throw new SafeFetchError('Request timed out', 'timeout');
      throw new SafeFetchError('Failed to fetch URL', 'network');
    }
    return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
  }

  return async function safeFetch(
    rawUrl: string,
    options: SafeFetchOptions = {}
  ): Promise<SafeFetchResult> {
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    const protocols = options.allowedProtocols ?? ['http:', 'https:'];
    const ports = options.allowedPorts ?? [80, 443];
    const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    let headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(options.headers ?? {})) {
      // Host is derived from the validated URL; Accept-Encoding is ours.
      if (k.toLowerCase() === 'host' || k.toLowerCase() === 'accept-encoding') continue;
      headers[k] = v;
    }
    headers['Accept-Encoding'] = 'gzip, deflate, br';

    let current: URL;
    try {
      current = new URL(rawUrl);
    } catch {
      throw new Error('Invalid URL');
    }

    for (let hop = 0; ; hop++) {
      // Per-hop static validation
      if (!protocols.includes(current.protocol)) {
        throw new SsrfBlockedError(
          protocols.length === 1 && protocols[0] === 'https:'
            ? 'Only https URLs are supported'
            : 'Only http and https URLs are supported'
        );
      }
      if (current.username || current.password) {
        throw new SsrfBlockedError('URL not allowed: credentials in URL are not supported');
      }
      const port = current.port ? Number(current.port) : current.protocol === 'https:' ? 443 : 80;
      if (!ports.includes(port)) {
        throw new SsrfBlockedError('URL not allowed: unsupported port');
      }
      assertHostnameAllowed(current.hostname);

      const { res } = await requestOnce(current, headers, signal);
      const status = res.statusCode ?? 0;

      if (REDIRECT_STATUSES.has(status) && res.headers.location) {
        res.destroy();
        if (hop >= maxRedirects) {
          throw new SafeFetchError('Too many redirects', 'too_many_redirects');
        }
        let next: URL;
        try {
          next = new URL(res.headers.location, current);
        } catch {
          throw new SafeFetchError('Invalid redirect location', 'network');
        }
        if (next.origin !== current.origin) {
          headers = Object.fromEntries(
            Object.entries(headers).filter(([k]) => !SENSITIVE_HEADERS.includes(k.toLowerCase()))
          );
        }
        current = next;
        continue;
      }

      const ok = status >= 200 && status < 300;
      if (ok && options.allowedContentTypes) {
        const ct = String(res.headers['content-type'] ?? '');
        if (!options.allowedContentTypes.some((re) => re.test(ct))) {
          res.destroy();
          throw new SafeFetchError('URL does not point to an HTML page', 'content_type');
        }
      }

      const body = await readCapped(res, maxBytes, signal);
      return { status, ok, headers: res.headers, finalUrl: current.toString(), body };
    }
  };
}

/** Production fetcher: public addresses only. */
export const safeFetch = createSafeFetch({
  resolve: defaultResolve,
  isBlockedAddress: isPrivateIP,
});
