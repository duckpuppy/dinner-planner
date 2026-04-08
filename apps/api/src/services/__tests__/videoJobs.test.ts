/**
 * Service unit tests for videoJobs (mocked db and videoDownload).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// Mock db before importing services
// ============================================================

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue(null),
}));

vi.mock('../../db/index.js', () => ({
  db: mockDb,
  schema: {
    videoJobs: {
      id: null,
      dishId: null,
      sourceUrl: null,
      status: null,
      progress: null,
      resultVideoFilename: null,
      resultMetadata: null,
      extractedRecipe: null,
      error: null,
    },
  },
}));

vi.mock('../videoDownload.js', () => ({
  downloadVideo: vi.fn(),
  getVideoStorageUsage: vi.fn(),
}));

vi.mock('../recipeExtraction.js', () => ({
  extractRecipeFromMetadata: vi
    .fn()
    .mockResolvedValue({ recipe: null, rawTitle: '', rawDescription: '', source: 'none' }),
}));

import * as videoDownload from '../videoDownload.js';
import * as recipeExtraction from '../recipeExtraction.js';
import { createVideoJob, getVideoJob, processVideoJob } from '../videoJobs.js';

const mockDownloadVideo = vi.mocked(videoDownload.downloadVideo);
const mockGetVideoStorageUsage = vi.mocked(videoDownload.getVideoStorageUsage);
const mockExtractRecipeFromMetadata = vi.mocked(recipeExtraction.extractRecipeFromMetadata);

// --- Chain helpers ---

function makeSelect(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

function makeInsert() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

function makeUpdate() {
  return {
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createVideoJob
// ---------------------------------------------------------------------------

describe('createVideoJob', () => {
  it('inserts a row and returns the generated id', async () => {
    const insert = makeInsert();
    mockDb.insert.mockReturnValue(insert);

    const id = await createVideoJob('https://www.youtube.com/watch?v=abc');

    expect(mockDb.insert).toHaveBeenCalledOnce();
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: 'https://www.youtube.com/watch?v=abc',
        status: 'pending',
        progress: 0,
        dishId: null,
      })
    );
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('accepts an optional dishId', async () => {
    const insert = makeInsert();
    mockDb.insert.mockReturnValue(insert);

    const id = await createVideoJob('https://www.youtube.com/watch?v=abc', 'dish-42');

    expect(insert.values).toHaveBeenCalledWith(expect.objectContaining({ dishId: 'dish-42' }));
    expect(typeof id).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// getVideoJob
// ---------------------------------------------------------------------------

describe('getVideoJob', () => {
  it('returns the job when found', async () => {
    const fakeJob = { id: 'job-1', sourceUrl: 'https://example.com', status: 'pending' };
    mockDb.select.mockReturnValue(makeSelect([fakeJob]));

    const result = await getVideoJob('job-1');

    expect(result).toEqual(fakeJob);
  });

  it('returns null when job is not found', async () => {
    mockDb.select.mockReturnValue(makeSelect([]));

    const result = await getVideoJob('nonexistent');

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// processVideoJob — storage exceeded
// ---------------------------------------------------------------------------

describe('processVideoJob — storage exceeded', () => {
  it('marks job as failed when storage limit is hit', async () => {
    mockGetVideoStorageUsage.mockResolvedValue(2000);
    const update = makeUpdate();
    mockDb.update.mockReturnValue(update);

    await processVideoJob('job-1', 1000);

    // Give fire-and-forget a tick to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(mockDb.update).toHaveBeenCalled();
    expect(update.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });
});

// ---------------------------------------------------------------------------
// processVideoJob — download succeeds
// ---------------------------------------------------------------------------

describe('processVideoJob — download succeeds', () => {
  it('sets status to complete with result metadata', async () => {
    mockGetVideoStorageUsage.mockResolvedValue(0);

    const fakeJob = {
      id: 'job-1',
      sourceUrl: 'https://www.youtube.com/watch?v=ok',
      status: 'pending',
    };
    mockDb.select.mockReturnValue(makeSelect([fakeJob]));

    const downloadResult = {
      videoFilename: 'abc.mp4',
      thumbnailFilename: 'abc.jpg',
      infoJson: { title: 'Test' },
      videoSize: 5_000_000,
      videoDuration: 120,
    };
    mockDownloadVideo.mockResolvedValue(downloadResult);
    mockExtractRecipeFromMetadata.mockResolvedValue({
      recipe: null,
      rawTitle: 'Test',
      rawDescription: '',
      source: 'none',
    });

    const updates: unknown[] = [];
    mockDb.update.mockImplementation(() => {
      const u = {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      };
      updates.push(u);
      return u;
    });

    await processVideoJob('job-1', 100_000_000);
    await new Promise((r) => setTimeout(r, 50));

    expect(mockExtractRecipeFromMetadata).toHaveBeenCalledWith(downloadResult.infoJson);
    expect(updates.length).toBeGreaterThanOrEqual(2);
    const lastUpdate = updates[updates.length - 1] as ReturnType<typeof makeUpdate>;
    expect(lastUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'complete', progress: 100, extractedRecipe: null })
    );
  });

  it('stores extractedRecipe JSON when LLM returns a recipe', async () => {
    mockGetVideoStorageUsage.mockResolvedValue(0);

    const fakeJob = {
      id: 'job-2',
      sourceUrl: 'https://www.youtube.com/watch?v=recipe',
      status: 'pending',
    };
    mockDb.select.mockReturnValue(makeSelect([fakeJob]));

    const downloadResult = {
      videoFilename: 'xyz.mp4',
      thumbnailFilename: null,
      infoJson: { title: 'Pasta', description: 'Boil water, cook pasta' },
      videoSize: 2_000_000,
      videoDuration: 60,
    };
    mockDownloadVideo.mockResolvedValue(downloadResult);

    const fakeRecipe = {
      name: 'Pasta',
      description: 'Simple pasta',
      type: 'main',
      ingredients: [],
      instructions: '',
      tags: [],
    };
    mockExtractRecipeFromMetadata.mockResolvedValue({
      recipe: fakeRecipe as never,
      rawTitle: 'Pasta',
      rawDescription: 'Boil water, cook pasta',
      source: 'llm',
    });

    const updates: unknown[] = [];
    mockDb.update.mockImplementation(() => {
      const u = {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      };
      updates.push(u);
      return u;
    });

    await processVideoJob('job-2', 100_000_000);
    await new Promise((r) => setTimeout(r, 50));

    const lastUpdate = updates[updates.length - 1] as ReturnType<typeof makeUpdate>;
    expect(lastUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'complete', extractedRecipe: JSON.stringify(fakeRecipe) })
    );
  });
});

// ---------------------------------------------------------------------------
// processVideoJob — download fails
// ---------------------------------------------------------------------------

describe('processVideoJob — download fails', () => {
  it('marks job as failed when download throws', async () => {
    mockGetVideoStorageUsage.mockResolvedValue(0);

    const fakeJob = {
      id: 'job-1',
      sourceUrl: 'https://www.youtube.com/watch?v=bad',
      status: 'pending',
    };
    mockDb.select.mockReturnValue(makeSelect([fakeJob]));
    mockDownloadVideo.mockRejectedValue(new Error('yt-dlp failed'));

    const updates: unknown[] = [];
    mockDb.update.mockImplementation(() => {
      const u = {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      };
      updates.push(u);
      return u;
    });

    await processVideoJob('job-1', 100_000_000);
    await new Promise((r) => setTimeout(r, 50));

    // Last update should set status to failed
    const lastUpdate = updates[updates.length - 1] as ReturnType<typeof makeUpdate>;
    expect(lastUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error: 'yt-dlp failed' })
    );
  });
});

// ---------------------------------------------------------------------------
// processVideoJob — job not found in DB
// ---------------------------------------------------------------------------

describe('processVideoJob — job not found', () => {
  it('returns early without updating when job missing', async () => {
    mockGetVideoStorageUsage.mockResolvedValue(0);
    mockDb.select.mockReturnValue(makeSelect([]));

    await processVideoJob('ghost-job', 100_000_000);
    await new Promise((r) => setTimeout(r, 50));

    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
