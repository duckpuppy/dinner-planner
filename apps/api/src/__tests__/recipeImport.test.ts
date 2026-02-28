import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseDuration,
  parseServings,
  parseNutritionValue,
  extractTags,
  parseInstructions,
  findRecipeInJsonLd,
  parseSchemaOrgRecipe,
  importRecipeFromUrl,
  validateRecipeUrl,
  isPrivateIP,
  SsrfBlockedError,
} from '../services/recipeImport.js';

// Mock dns module for DNS-based SSRF tests
vi.mock('node:dns', () => ({
  default: {
    promises: {
      lookup: vi.fn(),
    },
  },
}));

import dns from 'node:dns';

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
// parseNutritionValue
// ------------------------------------------------------------------
describe('parseNutritionValue', () => {
  it('returns null for undefined', () => {
    expect(parseNutritionValue(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(parseNutritionValue(null)).toBeNull();
  });

  it('returns number as-is', () => {
    expect(parseNutritionValue(250)).toBe(250);
    expect(parseNutritionValue(12.5)).toBe(12.5);
  });

  it('parses "250 kcal" → 250', () => {
    expect(parseNutritionValue('250 kcal')).toBe(250);
  });

  it('parses "12g" → 12', () => {
    expect(parseNutritionValue('12g')).toBe(12);
  });

  it('parses "12 g" → 12', () => {
    expect(parseNutritionValue('12 g')).toBe(12);
  });

  it('parses "3.5g" → 3.5', () => {
    expect(parseNutritionValue('3.5g')).toBe(3.5);
  });

  it('returns null for non-numeric string', () => {
    expect(parseNutritionValue('unknown')).toBeNull();
  });

  it('returns null for object', () => {
    expect(parseNutritionValue({})).toBeNull();
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
      category: 'Other',
      storeIds: [],
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

  it('returns null nutrition fields when no nutrition object present', () => {
    const html = makeHtml(BASE_RECIPE);
    const result = parseSchemaOrgRecipe(html, 'https://example.com');
    expect(result!.calories).toBeNull();
    expect(result!.proteinG).toBeNull();
    expect(result!.carbsG).toBeNull();
    expect(result!.fatG).toBeNull();
  });

  it('extracts numeric nutrition values from schema.org NutritionInformation', () => {
    const recipe = {
      ...BASE_RECIPE,
      nutrition: {
        '@type': 'NutritionInformation',
        calories: 450,
        proteinContent: 28,
        carbohydrateContent: 55,
        fatContent: 12,
      },
    };
    const html = makeHtml(recipe);
    const result = parseSchemaOrgRecipe(html, 'https://example.com');
    expect(result!.calories).toBe(450);
    expect(result!.proteinG).toBe(28);
    expect(result!.carbsG).toBe(55);
    expect(result!.fatG).toBe(12);
  });

  it('extracts string nutrition values like "250 kcal"', () => {
    const recipe = {
      ...BASE_RECIPE,
      nutrition: {
        '@type': 'NutritionInformation',
        calories: '250 kcal',
        proteinContent: '18g',
        carbohydrateContent: '30 g',
        fatContent: '8.5g',
      },
    };
    const html = makeHtml(recipe);
    const result = parseSchemaOrgRecipe(html, 'https://example.com');
    expect(result!.calories).toBe(250);
    expect(result!.proteinG).toBe(18);
    expect(result!.carbsG).toBe(30);
    expect(result!.fatG).toBe(8.5);
  });
});

// ------------------------------------------------------------------
// isPrivateIP
// ------------------------------------------------------------------
describe('isPrivateIP', () => {
  it('identifies loopback 127.0.0.1', () => {
    expect(isPrivateIP('127.0.0.1')).toBe(true);
  });

  it('identifies loopback 127.x.x.x range', () => {
    expect(isPrivateIP('127.255.0.1')).toBe(true);
  });

  it('identifies private 10.x.x.x', () => {
    expect(isPrivateIP('10.0.0.1')).toBe(true);
    expect(isPrivateIP('10.255.255.255')).toBe(true);
  });

  it('identifies private 172.16–31.x.x', () => {
    expect(isPrivateIP('172.16.0.1')).toBe(true);
    expect(isPrivateIP('172.31.255.255')).toBe(true);
  });

  it('does not block 172.15.x.x or 172.32.x.x', () => {
    expect(isPrivateIP('172.15.0.1')).toBe(false);
    expect(isPrivateIP('172.32.0.1')).toBe(false);
  });

  it('identifies private 192.168.x.x', () => {
    expect(isPrivateIP('192.168.1.1')).toBe(true);
  });

  it('identifies link-local 169.254.x.x', () => {
    expect(isPrivateIP('169.254.169.254')).toBe(true);
  });

  it('identifies IPv6 loopback ::1', () => {
    expect(isPrivateIP('::1')).toBe(true);
  });

  it('identifies IPv6 unique local fc00:: range', () => {
    expect(isPrivateIP('fc00::1')).toBe(true);
    expect(isPrivateIP('fd00::1')).toBe(true);
  });

  it('identifies IPv6 link-local fe80::', () => {
    expect(isPrivateIP('fe80::1')).toBe(true);
  });

  it('does not block public IPs', () => {
    expect(isPrivateIP('8.8.8.8')).toBe(false);
    expect(isPrivateIP('1.1.1.1')).toBe(false);
    expect(isPrivateIP('93.184.216.34')).toBe(false);
    expect(isPrivateIP('2606:2800:21f:cb07:6820:80da:af6b:8b2c')).toBe(false);
  });
});

// ------------------------------------------------------------------
// validateRecipeUrl
// ------------------------------------------------------------------
describe('validateRecipeUrl', () => {
  it('accepts a valid https URL', () => {
    expect(() => validateRecipeUrl('https://www.allrecipes.com/recipe/123')).not.toThrow();
  });

  it('rejects http URLs (https-only enforcement)', () => {
    expect(() => validateRecipeUrl('http://example.com/recipe')).toThrow(SsrfBlockedError);
  });

  it('rejects non-http schemes', () => {
    expect(() => validateRecipeUrl('file:///etc/passwd')).toThrow(SsrfBlockedError);
    expect(() => validateRecipeUrl('ftp://example.com')).toThrow(SsrfBlockedError);
  });

  it('rejects localhost', () => {
    expect(() => validateRecipeUrl('https://localhost/recipe')).toThrow(SsrfBlockedError);
  });

  it('rejects 127.0.0.1', () => {
    expect(() => validateRecipeUrl('https://127.0.0.1/recipe')).toThrow(SsrfBlockedError);
  });

  it('rejects private IP ranges', () => {
    expect(() => validateRecipeUrl('https://192.168.1.1/recipe')).toThrow(SsrfBlockedError);
    expect(() => validateRecipeUrl('https://10.0.0.1/recipe')).toThrow(SsrfBlockedError);
    expect(() => validateRecipeUrl('https://172.16.0.1/recipe')).toThrow(SsrfBlockedError);
  });

  it('rejects link-local addresses', () => {
    expect(() => validateRecipeUrl('https://169.254.169.254/latest/meta-data')).toThrow(
      SsrfBlockedError
    );
  });

  it('rejects invalid URL', () => {
    expect(() => validateRecipeUrl('not-a-url')).toThrow('Invalid URL');
  });

  it('throws SsrfBlockedError for private addresses', () => {
    expect(() => validateRecipeUrl('https://192.168.1.1/recipe')).toThrow(SsrfBlockedError);
  });
});

// ------------------------------------------------------------------
// importRecipeFromUrl (mocked fetch + DNS)
// ------------------------------------------------------------------

const HTML_HEADERS = new Headers({ 'content-type': 'text/html; charset=utf-8' });

describe('importRecipeFromUrl', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    // Default: DNS resolves to a public IP
    vi.mocked(dns.promises.lookup).mockResolvedValue({ address: '93.184.216.34', family: 4 });
  });

  it('throws SsrfBlockedError on http URL (https-only)', async () => {
    await expect(importRecipeFromUrl('http://example.com/recipe')).rejects.toThrow(
      SsrfBlockedError
    );
  });

  it('throws SsrfBlockedError on SSRF attempt (private IP in URL)', async () => {
    await expect(importRecipeFromUrl('https://192.168.1.1/recipe')).rejects.toThrow(
      SsrfBlockedError
    );
  });

  it('throws SsrfBlockedError when DNS resolves to private IP', async () => {
    vi.mocked(dns.promises.lookup).mockResolvedValue({ address: '10.0.0.1', family: 4 });
    await expect(importRecipeFromUrl('https://example.com/recipe')).rejects.toThrow(
      SsrfBlockedError
    );
  });

  it('throws SsrfBlockedError when DNS resolves to loopback', async () => {
    vi.mocked(dns.promises.lookup).mockResolvedValue({ address: '127.0.0.1', family: 4 });
    await expect(importRecipeFromUrl('https://example.com/recipe')).rejects.toThrow(
      SsrfBlockedError
    );
  });

  it('throws SsrfBlockedError error message mentions private or loopback', async () => {
    vi.mocked(dns.promises.lookup).mockResolvedValue({ address: '192.168.1.1', family: 4 });
    await expect(importRecipeFromUrl('https://example.com/recipe')).rejects.toThrow(
      'URL not allowed: private or loopback addresses are blocked'
    );
  });

  it('throws when DNS lookup fails', async () => {
    vi.mocked(dns.promises.lookup).mockRejectedValue(new Error('ENOTFOUND'));
    await expect(importRecipeFromUrl('https://example.com/recipe')).rejects.toThrow(
      'Could not resolve hostname'
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

  it('throws when Content-Length exceeds 5MB', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({
          'content-type': 'text/html',
          'content-length': String(6 * 1024 * 1024),
        }),
        text: async () => '<html></html>',
      })
    );
    await expect(importRecipeFromUrl('https://example.com')).rejects.toThrow(
      'Response too large to process'
    );
  });

  it('throws when streaming body exceeds 5MB', async () => {
    const bigBody = 'x'.repeat(6 * 1024 * 1024);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => bigBody,
      })
    );
    await expect(importRecipeFromUrl('https://example.com')).rejects.toThrow(
      'Response too large to process'
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
