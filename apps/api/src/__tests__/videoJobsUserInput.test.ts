/**
 * Re-extraction with user-supplied input (dinner-22c.3), against a real in-memory
 * SQLite database. The model call and the link resolver are mocked.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';

const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('../db/index.js', async () => {
  const actualSchema = await import('../db/schema.js');
  return {
    schema: actualSchema,
    get db() {
      return holder.db;
    },
  };
});

vi.mock('../services/recipeExtraction.js', () => ({
  extractRecipeFromMetadata: vi.fn(),
}));
vi.mock('../services/linkedRecipe.js', async () => {
  const actual = await vi.importActual<typeof import('../services/linkedRecipe.js')>(
    '../services/linkedRecipe.js'
  );
  return {
    buildLinkMeta: actual.buildLinkMeta,
    extractCandidateUrls: actual.extractCandidateUrls,
    followLinks: vi.fn(),
    resolveLinkedRecipe: vi.fn(),
  };
});
vi.mock('../services/videoDownload.js', () => ({
  downloadVideo: vi.fn(),
  fetchMetadataOnly: vi.fn(),
  getVideoStorageUsage: vi.fn(),
}));
vi.mock('../services/appEvents.js', () => ({ logEvent: vi.fn() }));

import { claimReextract, processReextract, getVideoJob } from '../services/videoJobs.js';
import { extractRecipeFromMetadata } from '../services/recipeExtraction.js';
import { followLinks, resolveLinkedRecipe } from '../services/linkedRecipe.js';
import {
  LINKED_PAGE_NO_RECIPE_MESSAGE,
  LINK_UNUSABLE_MESSAGE,
  LINK_UNREADABLE_MESSAGE,
  LINK_BLOCKED_MESSAGE,
} from '../services/userInputExtraction.js';

const mockExtract = vi.mocked(extractRecipeFromMetadata);
const mockFollow = vi.mocked(followLinks);
const mockResolve = vi.mocked(resolveLinkedRecipe);

let sqlite: Database.Database;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

const POST_URL = 'https://www.facebook.com/reel/123';
const PAGE_URL = 'https://example.com/recipe';

function recipe(name: string, sourceUrl: string | null = null) {
  return {
    name,
    sourceUrl,
    videoUrl: sourceUrl ? POST_URL : null,
    ingredients: [],
    steps: [],
  } as never;
}

function noRecipe() {
  return { recipe: null, status: 'no_recipe', error: 'x' } as never;
}

function resolved(result: 'recipe' | 'text' | 'blocked' | 'no_recipe' | 'error') {
  return {
    recipe: result === 'recipe' ? recipe('Page recipe', PAGE_URL) : null,
    pageText: result === 'text' ? 'Blog post with a recipe in prose' : null,
    pageHost: result === 'text' ? 'example.com' : null,
    outcomes: [{ url: 'example.com/recipe', result }],
  } as never;
}

beforeAll(() => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = OFF');
  testDb = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: './drizzle' });
  sqlite.pragma('foreign_keys = ON');
  holder.db = testDb;
});

beforeEach(() => {
  mockExtract.mockReset();
  mockFollow.mockReset();
  mockResolve.mockReset();
  mockFollow.mockResolvedValue({
    recipe: null,
    pageText: null,
    pageHost: null,
    outcomes: [],
    linkedPage: null,
  });
  sqlite.exec('DELETE FROM video_jobs; DELETE FROM families;');
  testDb.insert(schema.families).values({ id: 'fam-a', name: 'A' }).run();
  testDb
    .insert(schema.videoJobs)
    .values({
      id: 'j1',
      familyId: 'fam-a',
      sourceUrl: POST_URL,
      status: 'complete',
      transcript: 'spoken words',
      extractionStatus: 'no_description',
      resultMetadata: JSON.stringify({
        thumbnailFilename: 't.jpg',
        infoJson: { title: 'T', description: '' },
      }),
    })
    .run();
});

async function run(userInput?: { extraText?: string; recipeUrl?: string }) {
  expect(await claimReextract('j1', userInput)).toBe(true);
  processReextract('j1');
  await vi.waitFor(async () => {
    expect((await getVideoJob('j1'))?.status).toBe('complete');
  });
  const job = (await getVideoJob('j1'))!;
  return {
    job,
    meta: JSON.parse(job.resultMetadata!) as Record<string, unknown>,
    recipe: job.extractedRecipe
      ? (JSON.parse(job.extractedRecipe) as Record<string, unknown>)
      : null,
  };
}

describe('claimReextract persistence', () => {
  it('stores userInput under resultMetadata.userInput and keeps the rest', async () => {
    mockExtract.mockResolvedValue(noRecipe());
    const { meta } = await run({ extraText: 'pasted' });
    expect(meta.userInput).toEqual({ extraText: 'pasted' });
    expect(meta.thumbnailFilename).toBe('t.jpg');
    expect(meta.infoJson).toEqual({ title: 'T', description: '' });
    expect(meta.extractionSource).toBe('caption');
  });

  it('does not add userInput when none is given', async () => {
    mockExtract.mockResolvedValue(noRecipe());
    const { meta } = await run();
    expect(meta.userInput).toBeUndefined();
  });

  it('a second plain re-extract reuses the persisted input', async () => {
    mockExtract.mockResolvedValue(noRecipe());
    await run({ extraText: 'remember me' });
    await run();
    expect(mockExtract).toHaveBeenLastCalledWith(
      { title: 'T', description: '' },
      'spoken words',
      expect.objectContaining({ extraText: 'remember me' })
    );
  });

  it('a persisted recipeUrl is reused by a plain re-extract', async () => {
    mockResolve.mockResolvedValue(resolved('recipe'));
    await run({ recipeUrl: PAGE_URL });
    const { meta } = await run();
    expect(mockResolve).toHaveBeenCalledTimes(2);
    expect(meta.userInput).toEqual({ recipeUrl: PAGE_URL });
  });

  it('new input replaces the old input entirely', async () => {
    mockResolve.mockResolvedValue(resolved('recipe'));
    await run({ recipeUrl: PAGE_URL });
    mockExtract.mockResolvedValue(noRecipe());
    const { meta } = await run({ extraText: 'now text' });
    expect(meta.userInput).toEqual({ extraText: 'now text' });
    expect(meta.extractionSource).toBe('caption');
  });
});

describe('extraText', () => {
  it('reaches the model input, caption link discovery still runs, post URL is patched', async () => {
    mockExtract.mockResolvedValue({
      recipe: recipe('Soup'),
      status: 'llm',
      error: null,
    } as never);
    const { job, recipe: r } = await run({ extraText: '2 cups flour' });
    expect(mockFollow).toHaveBeenCalledTimes(1);
    expect(mockExtract).toHaveBeenCalledWith({ title: 'T', description: '' }, 'spoken words', {
      linkedPage: null,
      extraText: '2 cups flour',
    });
    expect(job.extractionStatus).toBe('llm');
    expect(r?.sourceUrl).toBe(POST_URL);
    expect(r?.videoUrl).toBe(POST_URL);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('a link found in the caption still wins over the model', async () => {
    mockFollow.mockResolvedValue({
      recipe: recipe('Caption link recipe', 'https://blog.test/r'),
      pageText: null,
      pageHost: null,
      outcomes: [{ url: 'blog.test/r', result: 'recipe' }],
      linkedPage: null,
    } as never);
    const { recipe: r, meta } = await run({ extraText: 'text' });
    expect(r?.name).toBe('Caption link recipe');
    expect(meta.extractionSource).toBe('linked_page');
    expect(mockExtract).not.toHaveBeenCalled();
  });
});

describe('pasted recipeUrl (resolved via linkedRecipe.resolveLinkedRecipe)', () => {
  it('uses the page recipe directly (no LLM, no auto-discovery), records linked_page', async () => {
    mockResolve.mockResolvedValue(resolved('recipe'));
    const { job, meta, recipe: r } = await run({ recipeUrl: PAGE_URL });
    expect(mockResolve).toHaveBeenCalledWith([PAGE_URL], { postUrl: POST_URL });
    expect(mockFollow).not.toHaveBeenCalled();
    expect(mockExtract).not.toHaveBeenCalled();
    expect(job.extractionStatus).toBe('llm');
    expect(job.extractionError).toBeNull();
    expect(r?.sourceUrl).toBe(PAGE_URL);
    expect(r?.videoUrl).toBe(POST_URL);
    expect(meta.extractionSource).toBe('linked_page');
    expect(meta.userInput).toEqual({ recipeUrl: PAGE_URL });
    expect(meta.linkOutcomes).toEqual([{ url: 'example.com/recipe', result: 'recipe' }]);
  });

  it('falls back to the page text: fed to the model as the linked page, source linked_text', async () => {
    mockResolve.mockResolvedValue(resolved('text'));
    mockExtract.mockResolvedValue({ recipe: recipe('Prose'), status: 'llm', error: null } as never);
    const { job, meta } = await run({ recipeUrl: PAGE_URL });
    expect(mockExtract).toHaveBeenCalledWith({ title: 'T', description: '' }, 'spoken words', {
      linkedPage: { host: 'example.com', text: 'Blog post with a recipe in prose' },
      extraText: undefined,
    });
    expect(job.extractionStatus).toBe('llm');
    expect(meta.extractionSource).toBe('linked_text');
  });

  it('a blocked site gets the paste-the-text message (no LLM call)', async () => {
    mockResolve.mockResolvedValue(resolved('blocked'));
    const { job } = await run({ recipeUrl: PAGE_URL });
    expect(job.status).toBe('complete');
    expect(job.extractionStatus).toBe('failed');
    expect(job.extractionError).toBe(
      'That site blocked our automated request. Open the page and paste the recipe text here instead.'
    );
    expect(job.extractionError).toBe(LINK_BLOCKED_MESSAGE);
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it('a page without recipe data finishes as no_recipe with the paste hint', async () => {
    mockResolve.mockResolvedValue(resolved('no_recipe'));
    const { job, recipe: r } = await run({ recipeUrl: PAGE_URL });
    expect(job.extractionStatus).toBe('no_recipe');
    expect(job.extractionError).toBe(
      'That page has no recipe data we can read. Paste the recipe text instead.'
    );
    expect(job.extractionError).toBe(LINKED_PAGE_NO_RECIPE_MESSAGE);
    expect(r).toBeNull();
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it('a fetch error gives a friendly message without raw text', async () => {
    mockResolve.mockResolvedValue(resolved('error'));
    const { job } = await run({ recipeUrl: PAGE_URL });
    expect(job.extractionStatus).toBe('failed');
    expect(job.extractionError).toBe(LINK_UNREADABLE_MESSAGE);
  });

  it('private-address and social-media links are rejected before any fetch', async () => {
    for (const url of [
      'https://10.0.0.1/x',
      'https://localhost/x',
      'https://www.facebook.com/p/1',
    ]) {
      const { job } = await run({ recipeUrl: url });
      expect(job.extractionStatus).toBe('failed');
      expect(job.extractionError).toBe("That link can't be used.");
      expect(job.extractionError).toBe(LINK_UNUSABLE_MESSAGE);
    }
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('with both fields, a failed link falls back to the pasted text', async () => {
    mockResolve.mockResolvedValue(resolved('blocked'));
    mockExtract.mockResolvedValue({ recipe: recipe('T'), status: 'llm', error: null } as never);
    const { job } = await run({ recipeUrl: PAGE_URL, extraText: 'also text' });
    expect(job.extractionStatus).toBe('llm');
    expect(mockExtract).toHaveBeenCalledTimes(1);
  });

  it('only touches the targeted job row', async () => {
    testDb
      .insert(schema.videoJobs)
      .values({
        id: 'j2',
        familyId: 'fam-a',
        sourceUrl: POST_URL,
        status: 'complete',
        resultMetadata: '{"infoJson":{}}',
      })
      .run();
    mockResolve.mockResolvedValue(resolved('recipe'));
    await run({ recipeUrl: PAGE_URL });
    const [other] = testDb
      .select()
      .from(schema.videoJobs)
      .where(eq(schema.videoJobs.id, 'j2'))
      .all();
    expect(other.resultMetadata).toBe('{"infoJson":{}}');
  });
});
