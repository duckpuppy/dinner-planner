/**
 * Re-extraction with user-supplied input (dinner-22c.3), against a real in-memory
 * SQLite database. The model call and the page import are mocked.
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
vi.mock('../services/recipeImport.js', () => ({
  importRecipeFromUrl: vi.fn(),
}));
vi.mock('../services/videoDownload.js', () => ({
  downloadVideo: vi.fn(),
  fetchMetadataOnly: vi.fn(),
  getVideoStorageUsage: vi.fn(),
}));
vi.mock('../services/appEvents.js', () => ({ logEvent: vi.fn() }));

import { claimReextract, processReextract, getVideoJob } from '../services/videoJobs.js';
import { extractRecipeFromMetadata } from '../services/recipeExtraction.js';
import { importRecipeFromUrl } from '../services/recipeImport.js';
import { SsrfBlockedError } from '../services/safeFetch.js';
import {
  LINKED_PAGE_NO_RECIPE_MESSAGE,
  LINK_UNUSABLE_MESSAGE,
  LINK_UNREADABLE_MESSAGE,
} from '../services/userInputExtraction.js';

const mockExtract = vi.mocked(extractRecipeFromMetadata);
const mockImport = vi.mocked(importRecipeFromUrl);

let sqlite: Database.Database;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

const POST_URL = 'https://www.facebook.com/reel/123';
const PAGE_URL = 'https://example.com/recipe';

function recipe(name: string, sourceUrl: string | null = null) {
  return { name, sourceUrl, videoUrl: null, ingredients: [], steps: [] } as never;
}

function noRecipe() {
  return { recipe: null, status: 'no_recipe', error: 'x' } as never;
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
  mockImport.mockReset();
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
  });

  it('does not touch resultMetadata when no input is given', async () => {
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
      'remember me'
    );
  });

  it('new input replaces the old input entirely', async () => {
    mockImport.mockResolvedValue(recipe('R', PAGE_URL));
    await run({ recipeUrl: PAGE_URL });
    mockExtract.mockResolvedValue(noRecipe());
    const { meta } = await run({ extraText: 'now text' });
    expect(meta.userInput).toEqual({ extraText: 'now text' });
    expect(meta.extractionSource).toBeUndefined();
  });
});

describe('extraText', () => {
  it('reaches the model input and a successful recipe gets the post URL', async () => {
    mockExtract.mockResolvedValue({
      recipe: recipe('Soup'),
      status: 'llm',
      error: null,
    } as never);
    const { job, recipe: r } = await run({ extraText: '2 cups flour' });
    expect(mockExtract).toHaveBeenCalledWith(
      { title: 'T', description: '' },
      'spoken words',
      '2 cups flour'
    );
    expect(job.extractionStatus).toBe('llm');
    expect(r?.sourceUrl).toBe(POST_URL);
    expect(r?.videoUrl).toBe(POST_URL);
    expect(mockImport).not.toHaveBeenCalled();
  });
});

describe('recipeUrl', () => {
  it('uses the page recipe directly (no LLM), patches sourceUrl/videoUrl, records the source', async () => {
    mockImport.mockResolvedValue(recipe('Page recipe', PAGE_URL));
    const { job, meta, recipe: r } = await run({ recipeUrl: PAGE_URL });
    expect(mockExtract).not.toHaveBeenCalled();
    expect(job.extractionStatus).toBe('llm');
    expect(job.extractionError).toBeNull();
    expect(r?.name).toBe('Page recipe');
    expect(r?.sourceUrl).toBe(PAGE_URL);
    expect(r?.videoUrl).toBe(POST_URL);
    expect(meta.extractionSource).toBe('linked_page');
    expect(meta.userInput).toEqual({ recipeUrl: PAGE_URL });
  });

  it('a page without recipe data finishes as no_recipe with the paste hint', async () => {
    mockImport.mockRejectedValue(
      new Error(
        'No recipe data found on this page. The site may not support structured recipe data.'
      )
    );
    const { job, recipe: r } = await run({ recipeUrl: PAGE_URL });
    expect(job.status).toBe('complete');
    expect(job.extractionStatus).toBe('no_recipe');
    expect(job.extractionError).toBe(
      'That page has no recipe data we can read. Paste the recipe text instead.'
    );
    expect(job.extractionError).toBe(LINKED_PAGE_NO_RECIPE_MESSAGE);
    expect(r).toBeNull();
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it('SSRF-blocked and invalid links give the generic message, never the raw error', async () => {
    mockImport.mockRejectedValue(new SsrfBlockedError('URL not allowed: private 10.0.0.1'));
    let out = await run({ recipeUrl: 'https://10.0.0.1/x' });
    expect(out.job.extractionStatus).toBe('failed');
    expect(out.job.extractionError).toBe("That link can't be used.");
    expect(out.job.extractionError).toBe(LINK_UNUSABLE_MESSAGE);

    mockImport.mockRejectedValue(new Error('Invalid URL'));
    out = await run({ recipeUrl: 'https://x.test/' });
    expect(out.job.extractionError).toBe(LINK_UNUSABLE_MESSAGE);
  });

  it('a 403 / network failure gives a friendly message without the raw text', async () => {
    mockImport.mockRejectedValue(new Error('HTTP 403 fetching recipe URL'));
    const { job } = await run({ recipeUrl: PAGE_URL });
    expect(job.extractionStatus).toBe('failed');
    expect(job.extractionError).toBe(LINK_UNREADABLE_MESSAGE);
    expect(job.extractionError).not.toMatch(/403|HTTP/);
  });

  it('falls back to the pasted text when the link yields nothing but text was also given', async () => {
    mockImport.mockRejectedValue(new Error('No recipe data found on this page.'));
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
    mockImport.mockResolvedValue(recipe('R', PAGE_URL));
    await run({ recipeUrl: PAGE_URL });
    const [other] = testDb
      .select()
      .from(schema.videoJobs)
      .where(eq(schema.videoJobs.id, 'j2'))
      .all();
    expect(other.resultMetadata).toBe('{"infoJson":{}}');
  });
});
