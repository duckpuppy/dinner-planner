import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseDuration,
  parseServings,
  extractTags,
  parseInstructions,
  findRecipeInJsonLd,
  parseSchemaOrgRecipe,
  importRecipeFromUrl,
  validateRecipeUrl,
} from '../services/recipeImport.js';

// Helper: wrap a recipe object in a minimal HTML page with JSON-LD
function makeHtml(jsonLd: unknown): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body></body></html>`;
}

const BASE_RECIPE = {
  '@type': 'Recipe',
  name: 'Spaghetti Bolognese',
  description: 'A classic Italian pasta dish.',
  recipeIngredient: ['500g ground beef', '400g spaghetti', '2 cloves garlic'],
  recipeInstructions: 'Cook beef. Add sauce. Serve over pasta.',
  prepTime: 'PT15M',
  cookTime: 'PT30M',
  recipeYield: '4 servings',
  keywords: 'pasta,italian',
};

// ------------------------------------------------------------------
// parseDuration
// ------------------------------------------------------------------
describe('parseDuration', () => {
  it('parses PT15M → 15', () => {
    expect(parseDuration('PT15M')).toBe(15);
  });

  it('parses PT1H30M → 90', () => {
    expect(parseDuration('PT1H30M')).toBe(90);
  });

  it('parses PT1H → 60', () => {
    expect(parseDuration('PT1H')).toBe(60);
  });

  it('returns null for PT0S', () => {
    expect(parseDuration('PT0S')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseDuration(undefined)).toBeNull();
  });

  it('returns null for non-string', () => {
    expect(parseDuration(15)).toBeNull();
  });
});

// ------------------------------------------------------------------
// parseServings
// ------------------------------------------------------------------
describe('parseServings', () => {
  it('parses "4 servings" → 4', () => {
    expect(parseServings('4 servings')).toBe(4);
  });

  it('parses numeric 6 → 6', () => {
    expect(parseServings(6)).toBe(6);
  });

  it('parses array ["4"] → 4', () => {
    expect(parseServings(['4'])).toBe(4);
  });

  it('parses "serves 4-6" → 4 (first number)', () => {
    expect(parseServings('serves 4-6')).toBe(4);
  });

  it('returns null for 0', () => {
    expect(parseServings(0)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseServings(undefined)).toBeNull();
  });
});

// ------------------------------------------------------------------
// extractTags
// ------------------------------------------------------------------
describe('extractTags', () => {
  it('splits comma-separated keywords', () => {
    const tags = extractTags({ keywords: 'pasta,italian,dinner' });
    expect(tags).toEqual(['pasta', 'italian', 'dinner']);
  });

  it('includes recipeCategory', () => {
    const tags = extractTags({ keywords: 'pasta', recipeCategory: 'main course' });
    expect(tags).toContain('pasta');
    expect(tags).toContain('main course');
  });

  it('deduplicates tags', () => {
    const tags = extractTags({ keywords: 'pasta,pasta', recipeCategory: 'pasta' });
    expect(tags.filter((t) => t === 'pasta').length).toBe(1);
  });

  it('handles array keywords', () => {
    const tags = extractTags({ keywords: ['pasta', 'italian'] });
    expect(tags).toEqual(['pasta', 'italian']);
  });

  it('returns empty array when no keywords', () => {
    expect(extractTags({})).toEqual([]);
  });
});

// ------------------------------------------------------------------
// parseInstructions
// ------------------------------------------------------------------
describe('parseInstructions', () => {
  it('returns plain string directly', () => {
    expect(parseInstructions('Mix and bake.')).toBe('Mix and bake.');
  });

  it('joins HowToStep array via .text', () => {
    const steps = [
      { '@type': 'HowToStep', text: 'Step one.' },
      { '@type': 'HowToStep', text: 'Step two.' },
    ];
    expect(parseInstructions(steps)).toBe('Step one.\n\nStep two.');
  });

  it('joins string array', () => {
    expect(parseInstructions(['Boil water.', 'Add pasta.'])).toBe('Boil water.\n\nAdd pasta.');
  });

  it('handles HowToSection with itemListElement', () => {
    const section = [
      {
        '@type': 'HowToSection',
        itemListElement: [{ '@type': 'HowToStep', text: 'Nested step.' }],
      },
    ];
    expect(parseInstructions(section)).toBe('Nested step.');
  });

  it('returns empty string for non-array non-string', () => {
    expect(parseInstructions(null)).toBe('');
    expect(parseInstructions(42)).toBe('');
  });
});

// ------------------------------------------------------------------
// findRecipeInJsonLd
// ------------------------------------------------------------------
describe('findRecipeInJsonLd', () => {
  it('finds direct Recipe type', () => {
    const data = { '@type': 'Recipe', name: 'Pizza' };
    expect(findRecipeInJsonLd(data)).toBe(data);
  });

  it('finds Recipe inside @graph array', () => {
    const recipe = { '@type': 'Recipe', name: 'Pizza' };
    const data = { '@graph': [{ '@type': 'WebPage' }, recipe] };
    expect(findRecipeInJsonLd(data)).toBe(recipe);
  });

  it('returns null when no Recipe present', () => {
    expect(findRecipeInJsonLd({ '@type': 'WebPage' })).toBeNull();
  });

  it('returns null for non-object', () => {
    expect(findRecipeInJsonLd(null)).toBeNull();
    expect(findRecipeInJsonLd('string')).toBeNull();
  });
});

// ------------------------------------------------------------------
// parseSchemaOrgRecipe
// ------------------------------------------------------------------
describe('parseSchemaOrgRecipe', () => {
  it('parses a valid JSON-LD Recipe', () => {
    const html = makeHtml(BASE_RECIPE);
    const result = parseSchemaOrgRecipe(html, 'https://example.com/recipe');

    expect(result).not.toBeNull();
    expect(result!.name).toBe('Spaghetti Bolognese');
    expect(result!.description).toBe('A classic Italian pasta dish.');
    expect(result!.ingredients).toHaveLength(3);
    expect(result!.ingredients[0]).toEqual({
      quantity: null,
      unit: null,
      name: '500g ground beef',
      notes: null,
    });
    expect(result!.prepTime).toBe(15);
    expect(result!.cookTime).toBe(30);
    expect(result!.servings).toBe(4);
    expect(result!.sourceUrl).toBe('https://example.com/recipe');
    expect(result!.tags).toContain('pasta');
    expect(result!.tags).toContain('italian');
  });

  it('finds Recipe inside @graph wrapper', () => {
    const html = makeHtml({ '@graph': [{ '@type': 'WebPage' }, BASE_RECIPE] });
    const result = parseSchemaOrgRecipe(html, 'https://example.com');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Spaghetti Bolognese');
  });

  it('returns null when no script tag', () => {
    const html = '<html><body>No recipe here</body></html>';
    expect(parseSchemaOrgRecipe(html, 'https://example.com')).toBeNull();
  });

  it('returns null when script has no Recipe @type', () => {
    const html = makeHtml({ '@type': 'WebPage', name: 'Not a recipe' });
    expect(parseSchemaOrgRecipe(html, 'https://example.com')).toBeNull();
  });

  it('sets type to "main" by default', () => {
    const html = makeHtml(BASE_RECIPE);
    const result = parseSchemaOrgRecipe(html, 'https://example.com');
    expect(result!.type).toBe('main');
  });
});

// ------------------------------------------------------------------
// validateRecipeUrl
// ------------------------------------------------------------------
describe('validateRecipeUrl', () => {
  it('accepts a valid https URL', () => {
    expect(() => validateRecipeUrl('https://www.allrecipes.com/recipe/123')).not.toThrow();
  });

  it('accepts a valid http URL', () => {
    expect(() => validateRecipeUrl('http://example.com/recipe')).not.toThrow();
  });

  it('rejects non-http schemes', () => {
    expect(() => validateRecipeUrl('file:///etc/passwd')).toThrow();
    expect(() => validateRecipeUrl('ftp://example.com')).toThrow();
  });

  it('rejects localhost', () => {
    expect(() => validateRecipeUrl('http://localhost/recipe')).toThrow();
  });

  it('rejects 127.0.0.1', () => {
    expect(() => validateRecipeUrl('http://127.0.0.1/recipe')).toThrow();
  });

  it('rejects private IP ranges', () => {
    expect(() => validateRecipeUrl('http://192.168.1.1/recipe')).toThrow();
    expect(() => validateRecipeUrl('http://10.0.0.1/recipe')).toThrow();
    expect(() => validateRecipeUrl('http://172.16.0.1/recipe')).toThrow();
  });

  it('rejects link-local addresses', () => {
    expect(() => validateRecipeUrl('http://169.254.169.254/latest/meta-data')).toThrow();
  });

  it('rejects invalid URL', () => {
    expect(() => validateRecipeUrl('not-a-url')).toThrow();
  });
});

// ------------------------------------------------------------------
// importRecipeFromUrl (mocked fetch)
// ------------------------------------------------------------------

const HTML_HEADERS = new Headers({ 'content-type': 'text/html; charset=utf-8' });

describe('importRecipeFromUrl', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws on SSRF attempt (private IP)', async () => {
    await expect(importRecipeFromUrl('http://192.168.1.1/recipe')).rejects.toThrow(
      'private or internal'
    );
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, headers: HTML_HEADERS })
    );
    await expect(importRecipeFromUrl('https://example.com')).rejects.toThrow('HTTP 404');
  });

  it('throws for non-HTML content type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => '{}',
      })
    );
    await expect(importRecipeFromUrl('https://example.com')).rejects.toThrow(
      'does not point to an HTML page'
    );
  });

  it('throws when page has no recipe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: HTML_HEADERS,
        text: async () => '<html><body>No recipe</body></html>',
      })
    );
    await expect(importRecipeFromUrl('https://example.com')).rejects.toThrow(
      'No recipe data found'
    );
  });

  it('returns parsed recipe on success', async () => {
    const html = makeHtml(BASE_RECIPE);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: HTML_HEADERS,
        text: async () => html,
      })
    );
    const result = await importRecipeFromUrl('https://example.com/recipe');
    expect(result.name).toBe('Spaghetti Bolognese');
  });
});
