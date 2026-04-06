import * as cheerio from 'cheerio';
import dns from 'node:dns';
import type { ImportedRecipe } from '@dinner-planner/shared';
import { inferCategory } from './categoryHeuristics.js';

/**
 * Custom error thrown when a URL is blocked for SSRF reasons.
 * The route layer catches this and returns HTTP 400.
 */
export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfBlockedError';
  }
}

/**
 * Returns true if the given IP address falls within a private, loopback,
 * link-local, or otherwise reserved range that should not be reachable
 * from a public-facing service.
 */
export function isPrivateIP(ip: string): boolean {
  // IPv4 ranges
  const ipv4Patterns = [
    /^127\./, // 127.0.0.0/8  loopback
    /^10\./, // 10.0.0.0/8   private
    /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12 private
    /^192\.168\./, // 192.168.0.0/16 private
    /^169\.254\./, // 169.254.0.0/16 link-local (AWS metadata etc.)
    /^0\.0\.0\.0$/, // unspecified
  ];

  // IPv6 ranges
  const ipv6Patterns = [
    /^::1$/, // ::1 loopback
    /^fc[0-9a-f]{2}:/i, // fc00::/7 unique local (first half)
    /^fd[0-9a-f]{2}:/i, // fd00::/8 unique local (second half of fc00::/7)
    /^fe80:/i, // fe80::/10 link-local
  ];

  const lower = ip.toLowerCase();
  return ipv4Patterns.some((p) => p.test(lower)) || ipv6Patterns.some((p) => p.test(lower));
}

// Static hostname-level SSRF block (defense in depth before DNS resolution)
const PRIVATE_HOST_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
  /^0\.0\.0\.0$/,
];

// Domains known to block server-side scraping or lack structured recipe data
const UNSUPPORTED_DOMAINS = [
  'facebook.com',
  'fb.com',
  'fb.watch',
  'instagram.com',
  'tiktok.com',
  'twitter.com',
  'x.com',
  'pinterest.com',
];

/**
 * Validate the URL before any network activity:
 * - Must be https only
 * - Must not be localhost or a private/loopback/link-local address (static check)
 * Returns the parsed URL for further use.
 */
export function validateRecipeUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new SsrfBlockedError('Only https URLs are supported');
  }

  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || PRIVATE_HOST_PATTERNS.some((p) => p.test(host))) {
    throw new SsrfBlockedError('URL not allowed: private or loopback addresses are blocked');
  }

  const isSocialMedia = UNSUPPORTED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  if (isSocialMedia) {
    throw new Error(
      'This site cannot be imported directly. Please copy the recipe details and add them manually.'
    );
  }

  return parsed;
}

/**
 * Resolve the hostname to an IP via DNS and verify it is not a private address.
 * Throws SsrfBlockedError if the resolved IP is in a blocked range.
 */
async function assertPublicHost(hostname: string): Promise<void> {
  let address: string;
  try {
    const result = await dns.promises.lookup(hostname);
    address = result.address;
  } catch {
    throw new Error('Could not resolve hostname');
  }

  if (isPrivateIP(address)) {
    throw new SsrfBlockedError('URL not allowed: private or loopback addresses are blocked');
  }
}

// Validate a URL string — returns url if valid, null otherwise
function validateUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

// Parse ISO 8601 duration like PT15M, PT1H30M → total minutes or null
export function parseDuration(iso: unknown): number | null {
  if (typeof iso !== 'string') return null;
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?/);
  if (!match) return null;
  const hours = parseInt(match[1] ?? '0', 10);
  const minutes = parseInt(match[2] ?? '0', 10);
  const total = hours * 60 + minutes;
  return total > 0 ? total : null;
}

// Parse a nutrition value like "250 kcal", "12g", "12 g", 12 → number or null
export function parseNutritionValue(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return isFinite(val) ? val : null;
  if (typeof val === 'string') {
    const match = val.match(/^[\s]*([0-9]+(?:\.[0-9]+)?)/);
    if (match) {
      const n = parseFloat(match[1]);
      return isFinite(n) ? n : null;
    }
  }
  return null;
}

// Parse recipeYield: "4 servings" | "4-6" | 4 → first integer found, or null
export function parseServings(raw: unknown): number | null {
  if (typeof raw === 'number') return raw > 0 ? Math.round(raw) : null;
  if (Array.isArray(raw)) return parseServings(raw[0]);
  if (typeof raw === 'string') {
    const match = raw.match(/\d+/);
    if (match) {
      const n = parseInt(match[0], 10);
      return n > 0 ? n : null;
    }
  }
  return null;
}

// Extract tags from keywords (csv string|string[]) and recipeCategory
export function extractTags(recipe: Record<string, unknown>): string[] {
  const tags = new Set<string>();
  const addStr = (s: unknown) => {
    if (typeof s === 'string') {
      s.split(/[,;]/).forEach((t) => {
        const trimmed = t.trim().toLowerCase();
        if (trimmed) tags.add(trimmed);
      });
    }
  };
  const keywords = recipe['keywords'];
  if (Array.isArray(keywords)) keywords.forEach(addStr);
  else addStr(keywords);

  const category = recipe['recipeCategory'];
  if (Array.isArray(category)) category.forEach(addStr);
  else addStr(category);

  return Array.from(tags).slice(0, 10); // cap at 10 tags
}

// Resolve HowToStep | HowToSection | string | string[] → plain text
export function parseInstructions(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (!Array.isArray(raw)) return '';

  const lines: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      lines.push(item.trim());
    } else if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      if (obj['@type'] === 'HowToSection' && Array.isArray(obj['itemListElement'])) {
        // Recurse into section steps
        for (const step of obj['itemListElement'] as unknown[]) {
          if (step && typeof step === 'object') {
            const s = step as Record<string, unknown>;
            if (typeof s['text'] === 'string') lines.push(s['text'].trim());
          }
        }
      } else if (typeof obj['text'] === 'string') {
        lines.push(obj['text'].trim());
      }
    }
  }
  return lines.filter(Boolean).join('\n\n');
}

// Find a Recipe object in JSON-LD data (handles plain and @graph arrays)
export function findRecipeInJsonLd(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  // Direct {"@type": "Recipe"} or {"@type": ["Recipe", ...]}
  const type = obj['@type'];
  const isRecipe = type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'));
  if (isRecipe) return obj;

  // {"@graph": [...]} wrapper
  if (Array.isArray(obj['@graph'])) {
    for (const node of obj['@graph']) {
      const found = findRecipeInJsonLd(node);
      if (found) return found;
    }
  }

  return null;
}

// Parse schema.org Recipe JSON-LD from HTML → ImportedRecipe or null
export function parseSchemaOrgRecipe(html: string, sourceUrl: string): ImportedRecipe | null {
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]').toArray();

  for (const el of scripts) {
    try {
      const text = $(el).html();
      if (!text) continue;
      const data: unknown = JSON.parse(text);
      const recipe = findRecipeInJsonLd(data);
      if (!recipe) continue;

      const name = typeof recipe['name'] === 'string' ? recipe['name'].trim() : '';
      if (!name) continue;

      const rawIngredients = Array.isArray(recipe['recipeIngredient'])
        ? (recipe['recipeIngredient'] as unknown[]).filter((s) => typeof s === 'string')
        : [];

      const nutrition =
        recipe['nutrition'] && typeof recipe['nutrition'] === 'object'
          ? (recipe['nutrition'] as Record<string, unknown>)
          : null;

      return {
        name,
        description:
          typeof recipe['description'] === 'string'
            ? recipe['description'].trim().slice(0, 2000)
            : '',
        type: 'main',
        ingredients: rawIngredients.map((s) => {
          const name = (s as string).slice(0, 200);
          return {
            quantity: null,
            unit: null,
            name,
            notes: null,
            category: inferCategory(name),
            storeIds: [],
          };
        }),
        instructions: parseInstructions(recipe['recipeInstructions']).slice(0, 10000),
        prepTime: parseDuration(recipe['prepTime']),
        cookTime: parseDuration(recipe['cookTime']),
        servings: parseServings(recipe['recipeYield']),
        calories: nutrition ? parseNutritionValue(nutrition['calories']) : null,
        proteinG: nutrition ? parseNutritionValue(nutrition['proteinContent']) : null,
        carbsG: nutrition ? parseNutritionValue(nutrition['carbohydrateContent']) : null,
        fatG: nutrition ? parseNutritionValue(nutrition['fatContent']) : null,
        sourceUrl,
        videoUrl: extractVideoUrl(recipe),
        tags: extractTags(recipe),
      };
    } catch {
      continue;
    }
  }
  return null;
}

function extractVideoUrl(recipe: Record<string, unknown>): string | null {
  const video = recipe['video'];
  if (!video || typeof video !== 'object') return null;
  const v = video as Record<string, unknown>;
  const url = v['contentUrl'] ?? v['embedUrl'];
  return typeof url === 'string' ? validateUrl(url) : null;
}

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB

// Fetch URL, extract recipe, throw if not found
export async function importRecipeFromUrl(url: string): Promise<ImportedRecipe> {
  const parsed = validateRecipeUrl(url);

  // DNS-based SSRF check: resolve hostname and block private IPs
  await assertPublicHost(parsed.hostname);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('Failed to fetch recipe URL');
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching recipe URL`);
  }

  // Check Content-Type — only parse HTML responses
  const contentType = res.headers.get('content-type') ?? '';
  if (!/^text\/html\b/i.test(contentType) && !/^application\/xhtml\+xml\b/i.test(contentType)) {
    throw new Error('URL does not point to an HTML page');
  }

  // Guard against excessively large responses
  const contentLength = res.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
    throw new Error('Response too large to process');
  }

  const html = await res.text();
  if (html.length > MAX_RESPONSE_BYTES) {
    throw new Error('Response too large to process');
  }

  const recipe = parseSchemaOrgRecipe(html, url);
  if (!recipe) {
    throw new Error(
      'No recipe data found on this page. The site may not support structured recipe data.'
    );
  }
  return recipe;
}
