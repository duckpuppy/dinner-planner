/**
 * linkedRecipe: candidate extraction, resolution, and the runExtraction helpers.
 * safeFetch / importRecipeFromUrl are mocked; no real network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../recipeImport.js', () => ({ importRecipeFromUrl: vi.fn() }));
vi.mock('../safeFetch.js', async () => {
  class SsrfBlockedError extends Error {}
  return { safeFetch: vi.fn(), SsrfBlockedError };
});
vi.mock('../recipeExtraction.js', () => ({ selectComments: vi.fn() }));
vi.mock('../videoImportConfig.js', () => ({ isVideoCommentsEnabled: vi.fn() }));

import { importRecipeFromUrl } from '../recipeImport.js';
import { safeFetch, SsrfBlockedError } from '../safeFetch.js';
import { selectComments } from '../recipeExtraction.js';
import { isVideoCommentsEnabled } from '../videoImportConfig.js';
import {
  buildLinkMeta,
  extractCandidateUrls,
  extractPageText,
  followLinks,
  resolveLinkedRecipe,
} from '../linkedRecipe.js';

const mockImport = vi.mocked(importRecipeFromUrl);
const mockSafeFetch = vi.mocked(safeFetch);
const mockSelectComments = vi.mocked(selectComments);
const mockCommentsEnabled = vi.mocked(isVideoCommentsEnabled);

const POST = 'https://www.tiktok.com/@chef/video/123';

function recipe(over: Record<string, unknown> = {}) {
  return {
    name: 'Soup',
    description: null,
    ingredients: [{ name: 'water', quantity: 1, unit: 'cup', notes: null }],
    instructions: 'Boil it.',
    sourceUrl: 'x',
    videoUrl: null,
    tags: [],
    ...over,
  } as never;
}

function htmlRes(body: string, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {},
    finalUrl: 'https://blog.example.com/p',
    body,
  };
}

const LONG_PAGE = `<html><body><nav>MENU</nav><article>${'Mix flour and water. '.repeat(30)}</article><footer>FOOT</footer></body></html>`;

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
});

describe('extractCandidateUrls', () => {
  it('unwraps l.facebook.com and lm.facebook.com redirects (encoded u param)', () => {
    const target = 'https://blog.example.com/best-soup?x=1';
    const text = `see https://l.facebook.com/l.php?u=${encodeURIComponent(target)}&h=AT0abc and https://lm.facebook.com/l.php?u=${encodeURIComponent('https://other.example.org/r')}`;
    expect(extractCandidateUrls([text], POST)).toEqual([target, 'https://other.example.org/r']);
  });

  it('unwraps instagram, youtube and google redirectors and nested encoding', () => {
    const t = 'https://a.example.com/r';
    const doubly = encodeURIComponent(encodeURIComponent(t));
    const out = extractCandidateUrls(
      [
        `https://l.instagram.com/?u=${encodeURIComponent(t)}&e=1`,
        `https://www.youtube.com/redirect?q=${encodeURIComponent('https://b.example.com/r')}&v=1`,
        `https://www.google.com/url?q=${encodeURIComponent('https://c.example.com/r')}&sa=D`,
        `https://l.facebook.com/l.php?u=${doubly}`,
      ],
      POST
    );
    expect(out).toEqual([t, 'https://b.example.com/r', 'https://c.example.com/r']);
  });

  it('unwraps a redirector that wraps another redirector', () => {
    const inner = `https://l.facebook.com/l.php?u=${encodeURIComponent('https://deep.example.com/r')}`;
    const outer = `https://www.google.com/url?q=${encodeURIComponent(inner)}`;
    expect(extractCandidateUrls([outer], POST)).toEqual(['https://deep.example.com/r']);
  });

  it('strips tracking params but keeps meaningful ones, and drops the fragment', () => {
    const out = extractCandidateUrls(
      ['https://x.example.com/r?id=7&fbclid=A&utm_source=ig&UTM_medium=b&igshid=Z&gclid=G#top'],
      POST
    );
    expect(out).toEqual(['https://x.example.com/r?id=7']);
  });

  it('drops social/video hosts (incl. subdomains), CDN media, and the post itself', () => {
    const text = [
      'https://www.facebook.com/x',
      'https://fb.watch/abc',
      'https://m.instagram.com/p/1',
      'https://vm.tiktok.com/abc',
      'https://youtu.be/abc',
      'https://www.youtube.com/watch?v=1',
      'https://x.com/a',
      'https://twitter.com/a',
      'https://pinterest.com/pin/1',
      'https://scontent.fbcdn.net/a',
      'https://blog.example.com/pic.JPG',
      'https://blog.example.com/clip.mp4?x=1',
      'https://own.example.com/video/9?utm_source=a',
      'https://blog.example.com/keep',
    ].join(' ');
    expect(extractCandidateUrls([text], 'https://own.example.com/video/9/')).toEqual([
      'https://blog.example.com/keep',
    ]);
  });

  it('strips trailing punctuation and zero-width characters', () => {
    const text =
      'Recipe (https://a.example.com/one), then https://b.example.com/two. Also ​https://c.example.com/th​ree!';
    expect(extractCandidateUrls([text], POST)).toEqual([
      'https://a.example.com/one',
      'https://b.example.com/two',
      'https://c.example.com/three',
    ]);
  });

  it('dedupes, keeps first-occurrence order across texts, and caps at 3', () => {
    const out = extractCandidateUrls(
      [
        'https://a.example.com/1 https://b.example.com/2',
        'https://a.example.com/1 https://c.example.com/3 https://d.example.com/4',
      ],
      POST
    );
    expect(out).toEqual([
      'https://a.example.com/1',
      'https://b.example.com/2',
      'https://c.example.com/3',
    ]);
  });

  it('ignores garbage and non-http schemes without throwing', () => {
    expect(
      extractCandidateUrls(['ftp://x.com/a javascript:alert(1) http://', '', 'no links'], POST)
    ).toEqual([]);
    expect(
      extractCandidateUrls(['https://l.facebook.com/l.php?u=javascript%3Aalert(1)'], POST)
    ).toEqual([]);
  });
});

describe('extractPageText', () => {
  it('prefers <article>, removes boilerplate, collapses whitespace and caps length', () => {
    const t = extractPageText(
      '<body><nav>NAV</nav><script>bad()</script><article>Hello\n\n   world</article><footer>F</footer></body>'
    );
    expect(t).toBe('Hello world');
    expect(extractPageText(`<main>${'a'.repeat(100)}</main>`, 10)).toBe('aaaaaaaaaa...');
  });
});

describe('resolveLinkedRecipe', () => {
  it('a JSON-LD hit wins, patches sourceUrl/videoUrl, and stops the loop', async () => {
    mockImport.mockResolvedValueOnce(recipe());
    const r = await resolveLinkedRecipe(
      ['https://blog.example.com/soup?id=1', 'https://second.example.com/x'],
      { postUrl: POST }
    );
    expect(r.recipe?.sourceUrl).toBe('https://blog.example.com/soup?id=1');
    expect(r.recipe?.videoUrl).toBe(POST);
    expect(r.outcomes).toEqual([{ url: 'blog.example.com/soup', result: 'recipe' }]);
    expect(mockImport).toHaveBeenCalledTimes(1);
    expect(mockSafeFetch).not.toHaveBeenCalled();
  });

  it('outcome urls never include the query string', async () => {
    mockImport.mockRejectedValue(new Error('HTTP 500 fetching recipe URL'));
    const r = await resolveLinkedRecipe(['https://a.example.com/p?token=secret'], {
      postUrl: POST,
    });
    expect(JSON.stringify(r.outcomes)).not.toContain('secret');
  });

  it('an unusable JSON-LD recipe is not a win; moves on to the next candidate', async () => {
    mockImport
      .mockResolvedValueOnce(recipe({ ingredients: [], instructions: '  ' }))
      .mockResolvedValueOnce(recipe());
    const r = await resolveLinkedRecipe(['https://a.example.com/1', 'https://b.example.com/2'], {
      postUrl: POST,
    });
    expect(r.outcomes.map((o) => o.result)).toEqual(['no_recipe', 'recipe']);
    expect(r.recipe).not.toBeNull();
  });

  it('no JSON-LD: falls back to page text (first page only) for the LLM', async () => {
    mockImport.mockRejectedValue(new Error('No recipe data found on this page.'));
    mockSafeFetch.mockResolvedValue(htmlRes(LONG_PAGE));
    const r = await resolveLinkedRecipe(['https://a.example.com/1', 'https://b.example.com/2'], {
      postUrl: POST,
    });
    expect(r.recipe).toBeNull();
    expect(r.pageHost).toBe('a.example.com');
    expect(r.pageText).toContain('Mix flour and water.');
    expect(r.pageText).not.toContain('MENU');
    expect(r.pageText).not.toContain('FOOT');
    expect(r.pageText!.length).toBeLessThanOrEqual(6003);
    // second candidate: JSON-LD tried, but no second text fetch
    expect(mockSafeFetch).toHaveBeenCalledTimes(1);
    expect(r.outcomes.map((o) => o.result)).toEqual(['text', 'no_recipe']);
  });

  it('a thin no-JSON-LD page is no_recipe, not text', async () => {
    mockImport.mockRejectedValue(new Error('No recipe data found on this page.'));
    mockSafeFetch.mockResolvedValue(htmlRes('<body><article>tiny</article></body>'));
    const r = await resolveLinkedRecipe(['https://a.example.com/1'], { postUrl: POST });
    expect(r.pageText).toBeNull();
    expect(r.outcomes[0].result).toBe('no_recipe');
  });

  it.each([401, 403, 429])('HTTP %i is recorded as blocked', async (status) => {
    mockImport.mockRejectedValue(new Error(`HTTP ${status} fetching recipe URL`));
    const r = await resolveLinkedRecipe(['https://a.example.com/1'], { postUrl: POST });
    expect(r.outcomes).toEqual([{ url: 'a.example.com/1', result: 'blocked' }]);
    expect(r.recipe).toBeNull();
    expect(r.pageText).toBeNull();
  });

  it('other HTTP errors are error, not blocked', async () => {
    mockImport.mockRejectedValue(new Error('HTTP 500 fetching recipe URL'));
    const r = await resolveLinkedRecipe(['https://a.example.com/1'], { postUrl: POST });
    expect(r.outcomes[0].result).toBe('error');
  });

  it('a Cloudflare challenge on the text fetch is blocked and yields no text', async () => {
    mockImport.mockRejectedValue(new Error('No recipe data found on this page.'));
    mockSafeFetch.mockResolvedValue(htmlRes('<html><title>Just a moment...</title></html>'));
    const r = await resolveLinkedRecipe(['https://a.example.com/1'], { postUrl: POST });
    expect(r.outcomes[0].result).toBe('blocked');
    expect(r.pageText).toBeNull();
  });

  it('SSRF-blocked is error and nothing about the reason leaks', async () => {
    mockImport.mockRejectedValue(
      new SsrfBlockedError('URL not allowed: private or loopback addresses are blocked')
    );
    const r = await resolveLinkedRecipe(['https://10.0.0.5/internal?k=v'], { postUrl: POST });
    expect(r.outcomes).toEqual([{ url: '10.0.0.5/internal', result: 'error' }]);
    const logged = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(logged).not.toContain('private');
    expect(logged).not.toContain('k=v');
    expect(logged).not.toContain('/internal');
  });

  it('upgrades http candidates to https before fetching', async () => {
    mockImport.mockResolvedValueOnce(recipe());
    const r = await resolveLinkedRecipe(['http://a.example.com/1'], { postUrl: POST });
    expect(mockImport).toHaveBeenCalledWith('https://a.example.com/1');
    expect(r.recipe?.sourceUrl).toBe('https://a.example.com/1');
  });

  it('a hung candidate times out as error and the next candidate still runs', async () => {
    mockImport.mockImplementationOnce(() => new Promise(() => {})).mockResolvedValueOnce(recipe());
    const r = await resolveLinkedRecipe(['https://slow.example.com/1', 'https://b.example.com/2'], {
      postUrl: POST,
      candidateTimeoutMs: 20,
    });
    expect(r.outcomes.map((o) => o.result)).toEqual(['error', 'recipe']);
  });

  it('enforces the overall step deadline', async () => {
    mockImport.mockImplementation(() => new Promise(() => {}));
    const t0 = Date.now();
    const r = await resolveLinkedRecipe(
      ['https://a.example.com/1', 'https://b.example.com/2', 'https://c.example.com/3'],
      { postUrl: POST, totalTimeoutMs: 60, candidateTimeoutMs: 40 }
    );
    expect(Date.now() - t0).toBeLessThan(500);
    expect(r.outcomes).toHaveLength(3);
    expect(r.outcomes.every((o) => o.result === 'error')).toBe(true);
    expect(mockImport.mock.calls.length).toBeLessThan(3);
  });
});

describe('followLinks', () => {
  it('returns an empty stage and does no network when there are no links', async () => {
    mockCommentsEnabled.mockReturnValue(false);
    const r = await followLinks(POST, { description: 'just text' }, null);
    expect(r).toMatchObject({ recipe: null, linkedPage: null, outcomes: [] });
    expect(mockImport).not.toHaveBeenCalled();
  });

  it('collects links from description, transcript and (when enabled) comments', async () => {
    mockCommentsEnabled.mockReturnValue(true);
    mockSelectComments.mockReturnValue('full recipe https://c.example.com/c');
    mockImport.mockRejectedValue(new Error('HTTP 403 fetching recipe URL'));
    const r = await followLinks(
      POST,
      { description: 'https://a.example.com/a' },
      'say https://b.example.com/b'
    );
    expect(r.outcomes.map((o) => o.url)).toEqual([
      'a.example.com/a',
      'b.example.com/b',
      'c.example.com/c',
    ]);
  });

  it('ignores comments when the feature is off', async () => {
    mockCommentsEnabled.mockReturnValue(false);
    await followLinks(POST, { description: 'x' }, null);
    expect(mockSelectComments).not.toHaveBeenCalled();
  });

  it('packages page text as linkedPage when no recipe was found', async () => {
    mockCommentsEnabled.mockReturnValue(false);
    mockImport.mockRejectedValue(new Error('No recipe data found on this page.'));
    mockSafeFetch.mockResolvedValue(htmlRes(LONG_PAGE));
    const r = await followLinks(POST, { description: 'https://a.example.com/a' }, null);
    expect(r.linkedPage).toEqual({ host: 'a.example.com', text: expect.any(String) });
  });

  it('never throws', async () => {
    mockCommentsEnabled.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(
      followLinks(POST, { description: 'https://a.example.com/a' }, null)
    ).resolves.toMatchObject({
      recipe: null,
      outcomes: [],
    });
  });
});

describe('buildLinkMeta', () => {
  const page = { host: 'h', text: 't' };
  it('caption by default', () => {
    expect(buildLinkMeta({ recipe: null, outcomes: [], linkedPage: null }, true)).toEqual({
      extractionSource: 'caption',
      linkOutcomes: [],
    });
  });
  it('linked_page when the linked recipe was used', () => {
    expect(
      buildLinkMeta({ recipe: recipe(), outcomes: [], linkedPage: null }, true).extractionSource
    ).toBe('linked_page');
  });
  it('linked_text only when page text was given AND the model produced a recipe', () => {
    expect(
      buildLinkMeta({ recipe: null, outcomes: [], linkedPage: page }, true).extractionSource
    ).toBe('linked_text');
    expect(
      buildLinkMeta({ recipe: null, outcomes: [], linkedPage: page }, false).extractionSource
    ).toBe('caption');
  });
});
