import * as cheerio from 'cheerio';
import type { ImportedRecipe } from '@dinner-planner/shared';
import { inferCategory } from './categoryHeuristics.js';
import {
  SafeFetchError,
  SsrfBlockedError,
  assertHostnameAllowed,
  isPrivateIP,
} from './safeFetch.js';
import { fetchPageWithFallback } from './fetchPage.js';

export { SsrfBlockedError, isPrivateIP };

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
  assertHostnameAllowed(host);

  const isSocialMedia = UNSUPPORTED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  if (isSocialMedia) {
    throw new Error(
      'This site cannot be imported directly. Please copy the recipe details and add them manually.'
    );
  }

  return parsed;
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

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB

// Fetch URL, extract recipe, throw if not found
export async function importRecipeFromUrl(url: string): Promise<ImportedRecipe> {
  const parsed = validateRecipeUrl(url);

  // safeFetch re-validates scheme/host/resolved addresses on every redirect hop
  // and pins the connection to the validated addresses (no DNS rebinding).
  let res;
  try {
    res = await fetchPageWithFallback(parsed.toString(), {
      timeoutMs: 10_000,
      maxBytes: MAX_RESPONSE_BYTES,
      maxRedirects: 5,
      allowedProtocols: ['https:'],
      // Only parse HTML responses
      allowedContentTypes: [/^text\/html\b/i, /^application\/xhtml\+xml\b/i],
    });
  } catch (err) {
    if (err instanceof SsrfBlockedError) throw err;
    if (err instanceof SafeFetchError && err.code !== 'network' && err.code !== 'timeout') {
      throw new Error(err.message, { cause: err });
    }
    throw new Error('Failed to fetch recipe URL', { cause: err });
  }

  if (res.blocked) {
    // Still blocked after both header profiles (incl. a challenge served with 2xx or a 503):
    // report as 403 so callers treat it as a block.
    throw new Error(
      `HTTP ${[401, 403, 429].includes(res.status) ? res.status : 403} fetching recipe URL`
    );
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching recipe URL`);
  }

  const recipe = parseSchemaOrgRecipe(res.body, url);
  if (!recipe) {
    throw new Error(
      'No recipe data found on this page. The site may not support structured recipe data.'
    );
  }
  return recipe;
}
