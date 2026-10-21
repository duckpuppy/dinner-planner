/**
 * Link-following stage for video/post recipe import (dinner-22c.4).
 *
 * Creators often write "full recipe at example.com/..." in the caption or a
 * comment. This module finds such links, resolves them to a recipe (schema.org
 * JSON-LD, no browser or LLM needed) or, failing that, to readable page text the
 * LLM can use. Nothing here ever throws into the import: every failure is
 * recorded as a LinkOutcome and logged by host only.
 */
import * as cheerio from 'cheerio';
import { isUsableRecipe, type ImportedRecipe } from '@dinner-planner/shared';
import { importRecipeFromUrl } from './recipeImport.js';
import { SsrfBlockedError } from './safeFetch.js';
import { fetchPageWithFallback, isChallengePage } from './fetchPage.js';
import { selectComments } from './recipeExtraction.js';
import { isVideoCommentsEnabled } from './videoImportConfig.js';

export type LinkResult = 'recipe' | 'text' | 'blocked' | 'no_recipe' | 'error';

export interface LinkOutcome {
  /** host + path only; the query string is never stored */
  url: string;
  result: LinkResult;
}

export type ExtractionSource = 'caption' | 'linked_page' | 'linked_text';

/** Persisted into video_jobs.resultMetadata alongside infoJson. */
export interface LinkMeta {
  extractionSource: ExtractionSource;
  linkOutcomes: LinkOutcome[];
}

export interface LinkedPage {
  host: string;
  text: string;
}

export interface LinkedRecipeResult {
  recipe: ImportedRecipe | null;
  pageText: string | null;
  /** host of the page `pageText` came from */
  pageHost: string | null;
  outcomes: LinkOutcome[];
}

export const MAX_CANDIDATES = 3;
export const MAX_PAGE_TEXT = 6000;
const MIN_USEFUL_TEXT = 200;
const TOTAL_TIMEOUT_MS = 20_000;
const CANDIDATE_TIMEOUT_MS = 12_000;

// ---------------------------------------------------------------------------
// Candidate extraction (pure, no network)
// ---------------------------------------------------------------------------

const ZERO_WIDTH = new RegExp('[\\u200B-\\u200D\\u2060\\uFEFF]', 'g');
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCT = /[)\].,;:!?'"}>*_]+$/;

const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'igshid', 'igsh']);

const BLOCKED_HOSTS = [
  'facebook.com',
  'fb.com',
  'fb.watch',
  'instagram.com',
  'tiktok.com',
  'youtube.com',
  'youtu.be',
  'x.com',
  'twitter.com',
  'pinterest.com',
  // CDNs that only ever serve media
  'fbcdn.net',
  'cdninstagram.com',
  'ytimg.com',
  'googlevideo.com',
  'tiktokcdn.com',
  'twimg.com',
];

const MEDIA_EXT = /\.(?:jpe?g|png|gif|webp|svg|bmp|ico|mp4|m4v|mov|webm|mkv|avi|m3u8|mp3|m4a)$/i;

function hostMatches(host: string, domains: string[]): boolean {
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Unwrap one level of a known redirector, or return null if `u` is not one. */
function unwrapRedirector(u: URL): string | null {
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  let param: string | null = null;
  if ((host === 'l.facebook.com' || host === 'lm.facebook.com') && u.pathname === '/l.php') {
    param = 'u';
  } else if (host === 'l.instagram.com') {
    param = 'u';
  } else if ((host === 'youtube.com' || host === 'm.youtube.com') && u.pathname === '/redirect') {
    param = 'q';
  } else if (host === 'google.com' && u.pathname === '/url') {
    param = 'q';
  }
  if (!param) return null;
  const target = u.searchParams.get(param);
  if (!target) return null;
  // Some wrappers double-encode the target.
  return /^https?%3A/i.test(target) ? safeDecode(target) : target;
}

function normalizeCandidate(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // Unwrap nested redirectors (bounded)
  for (let i = 0; i < 3; i++) {
    const inner = unwrapRedirector(url);
    if (!inner) break;
    try {
      url = new URL(inner);
    } catch {
      return null;
    }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  for (const key of [...url.searchParams.keys()]) {
    const k = key.toLowerCase();
    if (TRACKING_PARAMS.has(k) || k.startsWith('utm_')) url.searchParams.delete(key);
  }
  url.hash = '';
  return url;
}

/** host + path, lowercase host, no trailing slash, no query: identity for "same page". */
function pageKey(url: URL): string {
  return `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`;
}

export function extractCandidateUrls(texts: string[], postUrl: string): string[] {
  let postKey: string | null = null;
  try {
    postKey = pageKey(new URL(postUrl));
  } catch {
    /* unparseable post URL: nothing to exclude */
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.replace(ZERO_WIDTH, '').matchAll(URL_RE)) {
      const raw = match[0].replace(TRAILING_PUNCT, '');
      const url = normalizeCandidate(raw);
      if (!url) continue;
      if (hostMatches(url.hostname.toLowerCase(), BLOCKED_HOSTS)) continue;
      if (MEDIA_EXT.test(url.pathname)) continue;
      if (pageKey(url) === postKey) continue;
      const href = url.toString();
      if (seen.has(href)) continue;
      seen.add(href);
      out.push(href);
      if (out.length >= MAX_CANDIDATES) return out;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

const BLOCKED_STATUSES = new Set([401, 403, 429]);

export { isChallengePage };

/** Readable text of a page: boilerplate removed, <article>/<main> preferred, capped. */
export function extractPageText(html: string, maxChars = MAX_PAGE_TEXT): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, nav, header, footer, aside, form').remove();
  const article = $('article').first();
  const main = $('main').first();
  const root = article.length ? article : main.length ? main : $('body');
  const text = root.text().replace(/\s+/g, ' ').trim();
  return text.length > maxChars ? text.slice(0, maxChars) + '...' : text;
}

function describeUrl(url: string): { label: string; host: string } {
  try {
    const u = new URL(url);
    return { label: `${u.hostname}${u.pathname}`, host: u.hostname };
  } catch {
    return { label: 'invalid-url', host: 'invalid-url' };
  }
}

/** importRecipeFromUrl only accepts https; most sites redirect http anyway. */
function upgradeToHttps(url: string): string {
  return url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : url;
}

class StepTimeout extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StepTimeout('timeout')), Math.max(ms, 1));
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

interface TextFetch {
  result: LinkResult;
  text?: string;
}

async function fetchPageText(url: string): Promise<TextFetch> {
  const res = await fetchPageWithFallback(url, {
    timeoutMs: 10_000,
    maxBytes: 2 * 1024 * 1024,
    maxRedirects: 5,
    allowedProtocols: ['https:'],
    allowedContentTypes: [/^text\/html\b/i, /^application\/xhtml\+xml\b/i],
  });
  if (res.blocked || BLOCKED_STATUSES.has(res.status)) return { result: 'blocked' };
  if (!res.ok) return { result: 'error' };
  const text = extractPageText(res.body);
  return text.length >= MIN_USEFUL_TEXT ? { result: 'text', text } : { result: 'no_recipe' };
}

export interface ResolveOptions {
  postUrl: string;
  /** Whole-step deadline. Default 20 s. */
  totalTimeoutMs?: number;
  /** Per-candidate deadline. Default 12 s. */
  candidateTimeoutMs?: number;
}

async function resolveOne(
  candidate: string,
  postUrl: string,
  wantText: boolean
): Promise<{ outcome: LinkResult; recipe?: ImportedRecipe; text?: string }> {
  const target = upgradeToHttps(candidate);
  try {
    const recipe = await importRecipeFromUrl(target);
    if (isUsableRecipe(recipe)) {
      recipe.sourceUrl = target;
      recipe.videoUrl = postUrl;
      return { outcome: 'recipe', recipe };
    }
    return { outcome: 'no_recipe' };
  } catch (err) {
    if (err instanceof SsrfBlockedError) return { outcome: 'error' };
    const msg = err instanceof Error ? err.message : '';
    const http = /^HTTP (\d{3})\b/.exec(msg);
    if (http) {
      return { outcome: BLOCKED_STATUSES.has(Number(http[1])) ? 'blocked' : 'error' };
    }
    // importRecipeFromUrl signals "fetched fine, no JSON-LD recipe" only by message.
    if (!/^No recipe data found/.test(msg)) return { outcome: 'error' };
  }
  // Page fetched fine but carries no JSON-LD recipe: keep its text for the LLM.
  if (!wantText) return { outcome: 'no_recipe' };
  try {
    const t = await fetchPageText(target);
    return { outcome: t.result, text: t.text };
  } catch {
    return { outcome: 'error' };
  }
}

export async function resolveLinkedRecipe(
  candidates: string[],
  opts: ResolveOptions
): Promise<LinkedRecipeResult> {
  const outcomes: LinkOutcome[] = [];
  const result: LinkedRecipeResult = { recipe: null, pageText: null, pageHost: null, outcomes };
  const deadline = Date.now() + (opts.totalTimeoutMs ?? TOTAL_TIMEOUT_MS);
  const perCandidate = opts.candidateTimeoutMs ?? CANDIDATE_TIMEOUT_MS;

  for (const candidate of candidates) {
    const remaining = deadline - Date.now();
    const { label, host } = describeUrl(candidate);
    if (remaining <= 0) {
      outcomes.push({ url: label, result: 'error' });
      console.warn(`[linkedRecipe] skipped ${host}: step deadline reached`);
      continue;
    }
    try {
      const r = await withTimeout(
        resolveOne(candidate, opts.postUrl, result.pageText === null),
        Math.min(perCandidate, remaining)
      );
      outcomes.push({ url: label, result: r.outcome });
      if (r.outcome === 'recipe' && r.recipe) {
        result.recipe = r.recipe;
        break;
      }
      if (r.outcome === 'text' && r.text && result.pageText === null) {
        result.pageText = r.text;
        result.pageHost = host;
      }
      if (r.outcome === 'error' || r.outcome === 'blocked') {
        console.warn(`[linkedRecipe] ${host}: ${r.outcome}`);
      }
    } catch (err) {
      outcomes.push({ url: label, result: 'error' });
      console.warn(
        `[linkedRecipe] ${host}: ${err instanceof StepTimeout ? 'timed out' : 'unexpected error'}`
      );
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Integration helpers used by videoJobs.runExtraction
// ---------------------------------------------------------------------------

export interface LinkStage extends LinkedRecipeResult {
  /** page text packaged for extractRecipeFromMetadata, or null */
  linkedPage: LinkedPage | null;
}

/**
 * Find and resolve links in the post's description, transcript and (when
 * enabled) comments. Never throws.
 */
export async function followLinks(
  postUrl: string,
  infoJson: Record<string, unknown>,
  transcript: string | null
): Promise<LinkStage> {
  const empty: LinkStage = {
    recipe: null,
    pageText: null,
    pageHost: null,
    outcomes: [],
    linkedPage: null,
  };
  try {
    const description = typeof infoJson['description'] === 'string' ? infoJson['description'] : '';
    const comments = isVideoCommentsEnabled() ? selectComments(infoJson, 20_000) : null;
    const candidates = extractCandidateUrls(
      [description, transcript ?? '', comments ?? ''],
      postUrl
    );
    if (candidates.length === 0) return empty;
    const r = await resolveLinkedRecipe(candidates, { postUrl });
    return {
      ...r,
      linkedPage:
        r.pageText && r.pageHost && !r.recipe ? { host: r.pageHost, text: r.pageText } : null,
    };
  } catch {
    console.warn('[linkedRecipe] link stage failed unexpectedly');
    return empty;
  }
}

export function buildLinkMeta(
  stage: Pick<LinkStage, 'recipe' | 'outcomes' | 'linkedPage'>,
  modelProducedRecipe: boolean
): LinkMeta {
  const extractionSource: ExtractionSource = stage.recipe
    ? 'linked_page'
    : stage.linkedPage && modelProducedRecipe
      ? 'linked_text'
      : 'caption';
  return { extractionSource, linkOutcomes: stage.outcomes };
}
