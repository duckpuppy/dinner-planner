import * as cheerio from 'cheerio';
import type { ImportedRecipe } from '@dinner-planner/shared';

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

      return {
        name,
        description: typeof recipe['description'] === 'string' ? recipe['description'].trim() : '',
        type: 'main',
        ingredients: rawIngredients.map((s) => ({
          quantity: null,
          unit: null,
          name: s as string,
          notes: null,
        })),
        instructions: parseInstructions(recipe['recipeInstructions']),
        prepTime: parseDuration(recipe['prepTime']),
        cookTime: parseDuration(recipe['cookTime']),
        servings: parseServings(recipe['recipeYield']),
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
  return typeof url === 'string' ? url : null;
}

// Fetch URL, extract recipe, throw if not found
export async function importRecipeFromUrl(url: string): Promise<ImportedRecipe> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DinnerPlanner/1.0)' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new Error(`Failed to fetch URL: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching recipe URL`);
  }

  const html = await res.text();
  const recipe = parseSchemaOrgRecipe(html, url);
  if (!recipe) {
    throw new Error(
      'No recipe data found on this page. The site may not support structured recipe data.'
    );
  }
  return recipe;
}
