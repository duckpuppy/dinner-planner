import { SafeFetchError, safeFetch } from './safeFetch.js';
import type { SafeFetchOptions, SafeFetchResult } from './safeFetch.js';

/**
 * Outbound page fetching policy shared by recipe import and link-following.
 *
 * Two header identities, tried in order:
 *  1. HONEST_HEADERS: a truthful app User-Agent. Most sites (including those behind
 *     Cloudflare) serve this fine.
 *  2. BROWSER_HEADERS: a complete Chrome-like header set, used only when the first
 *     attempt looks blocked. A UA that claims to be a browser but lacks the headers a
 *     browser sends (Sec-Fetch-*, Sec-CH-UA, ...) is what bot challenges flag, so the
 *     fallback sends the whole set, never a half-spoofed one.
 * Accept-Encoding and Host are deliberately absent: safeFetch owns both.
 */
export const HONEST_HEADERS: Record<string, string> = {
  'User-Agent': `DinnerPlanner/${process.env['APP_VERSION'] || 'dev'} (+recipe import)`,
  Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Sec-CH-UA': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'Sec-CH-UA-Mobile': '?0',
  'Sec-CH-UA-Platform': '"Windows"',
  'Upgrade-Insecure-Requests': '1',
};

export type HeaderProfile = 'honest' | 'browser';

const CHALLENGE_MARKERS = ['Just a moment', 'cf-chl', 'Attention Required'];
const BLOCKED_STATUSES = new Set([401, 403, 429, 503]);

export function isChallengePage(html: string): boolean {
  const head = html.slice(0, 20_000);
  return CHALLENGE_MARKERS.some((m) => head.includes(m));
}

/** True when a response looks like a bot block / challenge rather than real content. */
export function isBlockedResponse(
  res: Pick<SafeFetchResult, 'status' | 'headers' | 'body'>
): boolean {
  if (BLOCKED_STATUSES.has(res.status)) return true;
  const mitigated = res.headers?.['cf-mitigated'];
  const value = Array.isArray(mitigated) ? mitigated.join(',') : (mitigated ?? '');
  if (value.toLowerCase().includes('challenge')) return true;
  return isChallengePage(res.body);
}

export interface FetchPageResult extends SafeFetchResult {
  /** Profile that produced this response (the last one tried). */
  profile: HeaderProfile;
  /** True if the returned response is still a block/challenge after all attempts. */
  blocked: boolean;
}

const DEFAULT_TIMEOUT_MS = 10_000;

type Fetcher = (url: string, options: SafeFetchOptions) => Promise<SafeFetchResult>;

/**
 * safeFetch with the honest profile first and one browser-profile retry when the
 * response looks blocked. `timeoutMs` is one deadline for BOTH attempts. All SSRF,
 * redirect, size and content-type rules are safeFetch's and apply to each attempt.
 * Logs host + profile only, never the full URL.
 */
export async function fetchPageWithFallback(
  url: string,
  opts: Omit<SafeFetchOptions, 'headers'> = {},
  fetcher: Fetcher = safeFetch,
  log?: (msg: string) => void
): Promise<FetchPageResult> {
  const total = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const started = Date.now();
  const host = safeHost(url);

  const first = await fetcher(url, { ...opts, headers: HONEST_HEADERS, timeoutMs: total });
  if (!isBlockedResponse(first)) {
    return { ...first, profile: 'honest', blocked: false };
  }

  const remaining = total - (Date.now() - started);
  if (remaining <= 0) {
    throw new SafeFetchError('Request timed out', 'timeout');
  }
  log?.(`fetchPage: ${host} blocked with honest profile, retrying with browser profile`);
  const second = await fetcher(url, { ...opts, headers: BROWSER_HEADERS, timeoutMs: remaining });
  const blocked = isBlockedResponse(second);
  log?.(`fetchPage: ${host} browser profile ${blocked ? 'still blocked' : 'succeeded'}`);
  return { ...second, profile: 'browser', blocked };
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'invalid-url';
  }
}
