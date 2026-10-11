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
  and: vi.fn().mockReturnValue(null),
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
      transcript: null,
      extractedRecipe: null,
      error: null,
    },
  },
}));

vi.mock('../videoDownload.js', () => ({
  downloadVideo: vi.fn(),
  fetchMetadataOnly: vi.fn(),
  getVideoStorageUsage: vi.fn(),
}));

vi.mock('../recipeExtraction.js', () => ({
  extractRecipeFromMetadata: vi
    .fn()
    .mockResolvedValue({ recipe: null, rawTitle: '', rawDescription: '', source: 'none' }),
}));

import * as videoDownload from '../videoDownload.js';
import * as recipeExtraction from '../recipeExtraction.js';
import {
  createVideoJob,
  getVideoJob,
  getVideoJobForFamily,
  NO_VIDEO_WARNING,
  processVideoJob,
  reextractVideoJob,
} from '../videoJobs.js';
import { YtdlpError } from '../ytdlpErrors.js';

const mockDownloadVideo = vi.mocked(videoDownload.downloadVideo);
const mockFetchMetadataOnly = vi.mocked(videoDownload.fetchMetadataOnly);
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
      transcript: null,
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

    expect(mockExtractRecipeFromMetadata).toHaveBeenCalledWith(downloadResult.infoJson, null);
    expect(updates.length).toBeGreaterThanOrEqual(2);
    const lastUpdate = updates[updates.length - 1] as ReturnType<typeof makeUpdate>;
    expect(lastUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'complete', progress: 100, extractedRecipe: null })
    );
  });

  it('persists the parsed transcript onto the job row', async () => {
    mockGetVideoStorageUsage.mockResolvedValue(0);

    const fakeJob = {
      id: 'job-3',
      sourceUrl: 'https://www.youtube.com/watch?v=transcript',
      status: 'pending',
    };
    mockDb.select.mockReturnValue(makeSelect([fakeJob]));

    const downloadResult = {
      videoFilename: 'trn.mp4',
      thumbnailFilename: null,
      infoJson: { title: 'Transcript Test' },
      videoSize: 1_000_000,
      videoDuration: 90,
      transcript: 'today we are making pasta with garlic and olive oil',
    };
    mockDownloadVideo.mockResolvedValue(downloadResult);
    mockExtractRecipeFromMetadata.mockResolvedValue({
      recipe: null,
      rawTitle: 'Transcript Test',
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

    await processVideoJob('job-3', 100_000_000);
    await new Promise((r) => setTimeout(r, 50));

    const lastUpdate = updates[updates.length - 1] as ReturnType<typeof makeUpdate>;
    expect(lastUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'complete',
        transcript: 'today we are making pasta with garlic and olive oil',
      })
    );
  });

  it('persists null transcript when downloadVideo returns no transcript', async () => {
    mockGetVideoStorageUsage.mockResolvedValue(0);

    const fakeJob = {
      id: 'job-4',
      sourceUrl: 'https://www.youtube.com/watch?v=notranscript',
      status: 'pending',
    };
    mockDb.select.mockReturnValue(makeSelect([fakeJob]));

    const downloadResult = {
      videoFilename: 'notrn.mp4',
      thumbnailFilename: null,
      infoJson: { title: 'No Transcript' },
      videoSize: 1_000_000,
      videoDuration: 30,
      transcript: null,
    };
    mockDownloadVideo.mockResolvedValue(downloadResult);
    mockExtractRecipeFromMetadata.mockResolvedValue({
      recipe: null,
      rawTitle: 'No Transcript',
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

    await processVideoJob('job-4', 100_000_000);
    await new Promise((r) => setTimeout(r, 50));

    const lastUpdate = updates[updates.length - 1] as ReturnType<typeof makeUpdate>;
    expect(lastUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'complete', transcript: null })
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
    mockFetchMetadataOnly.mockRejectedValue(new Error('metadata failed'));

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

// ---------------------------------------------------------------------------
// processVideoJob — metadata-only fallback (dinner-5vx.1)
// ---------------------------------------------------------------------------

describe('processVideoJob — metadata-only fallback', () => {
  const fakeJob = {
    id: 'job-fb',
    sourceUrl: 'https://www.tiktok.com/t/ZPLhqTVQL/',
    status: 'pending',
  };
  const metaResult = {
    videoFilename: null,
    thumbnailFilename: null,
    infoJson: { title: 'Pepperoni Pizza Tacos', description: 'ingredients...' },
    videoSize: 0,
    videoDuration: null,
    transcript: null,
  };

  function captureUpdates() {
    const updates: ReturnType<typeof makeUpdate>[] = [];
    mockDb.update.mockImplementation(() => {
      const u = makeUpdate();
      updates.push(u);
      return u;
    });
    return updates;
  }

  async function run() {
    await processVideoJob('job-fb', 100_000_000);
    await new Promise((r) => setTimeout(r, 50));
  }

  beforeEach(() => {
    mockGetVideoStorageUsage.mockResolvedValue(0);
    mockDb.select.mockReturnValue(makeSelect([fakeJob]));
  });

  it('completes with a warning and a recipe when download fails but metadata succeeds', async () => {
    mockDownloadVideo.mockRejectedValue(
      new YtdlpError("This link doesn't point to a video", 'YTDLP_FAILED', 'Unsupported URL')
    );
    mockFetchMetadataOnly.mockResolvedValue(metaResult);
    const recipe = { name: 'Pizza Tacos', ingredients: [], tags: [] };
    mockExtractRecipeFromMetadata.mockResolvedValue({
      recipe: recipe as never,
      rawTitle: 'Pepperoni Pizza Tacos',
      rawDescription: 'ingredients...',
      source: 'llm',
      status: 'llm',
      error: null,
    });
    const updates = captureUpdates();

    await run();

    expect(mockFetchMetadataOnly).toHaveBeenCalledWith(fakeJob.sourceUrl);
    const last = updates[updates.length - 1];
    expect(last.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'complete',
        resultVideoFilename: null,
        warning: NO_VIDEO_WARNING,
        extractionStatus: 'llm',
        extractedRecipe: expect.stringContaining('Pizza Tacos'),
      })
    );
  });

  it('fails the job with the friendly download error when metadata also fails', async () => {
    mockDownloadVideo.mockRejectedValue(
      new YtdlpError("This link doesn't point to a video", 'YTDLP_FAILED', 'Unsupported URL')
    );
    mockFetchMetadataOnly.mockRejectedValue(
      new YtdlpError('metadata failed', 'YTDLP_FAILED', 'metadata failed')
    );
    const updates = captureUpdates();

    await run();

    const last = updates[updates.length - 1];
    expect(last.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        error: "This link doesn't point to a video",
      })
    );
    expect(mockExtractRecipeFromMetadata).not.toHaveBeenCalled();
  });

  it('does not fall back on a download timeout', async () => {
    mockDownloadVideo.mockRejectedValue(
      new YtdlpError('Download timed out after 10 minutes', 'TIMEOUT', 'timeout')
    );
    const updates = captureUpdates();

    await run();

    expect(mockFetchMetadataOnly).not.toHaveBeenCalled();
    const last = updates[updates.length - 1];
    expect(last.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error: 'Download timed out after 10 minutes' })
    );
  });

  it('does not fall back when the storage limit is exceeded', async () => {
    mockGetVideoStorageUsage.mockResolvedValue(2000);
    const updates = captureUpdates();

    await processVideoJob('job-fb', 1000);
    await new Promise((r) => setTimeout(r, 50));

    expect(mockDownloadVideo).not.toHaveBeenCalled();
    expect(mockFetchMetadataOnly).not.toHaveBeenCalled();
    expect(updates[0].set).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
  });
});

// ---------------------------------------------------------------------------
// processVideoJob — extraction outcome recorded (dinner-5vx.3)
// ---------------------------------------------------------------------------

describe('processVideoJob — extraction outcome', () => {
  it('completes with extractionStatus=failed and a friendly error when the LLM fails', async () => {
    mockGetVideoStorageUsage.mockResolvedValue(0);
    mockDb.select.mockReturnValue(
      makeSelect([{ id: 'job-x', sourceUrl: 'https://www.tiktok.com/t/abc/', status: 'pending' }])
    );
    mockDownloadVideo.mockResolvedValue({
      videoFilename: 'v.mp4',
      thumbnailFilename: null,
      infoJson: { title: 'Pizza Tacos', description: 'stuff' },
      videoSize: 10,
      videoDuration: 5,
      transcript: null,
    });
    mockExtractRecipeFromMetadata.mockResolvedValue({
      recipe: null,
      rawTitle: 'Pizza Tacos',
      rawDescription: 'stuff',
      source: 'none',
      status: 'failed',
      error: 'The AI model returned an error (HTTP 500)',
    });
    const updates: ReturnType<typeof makeUpdate>[] = [];
    mockDb.update.mockImplementation(() => {
      const u = makeUpdate();
      updates.push(u);
      return u;
    });

    await processVideoJob('job-x', 100_000_000);
    await new Promise((r) => setTimeout(r, 50));

    const last = updates[updates.length - 1];
    expect(last.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'complete',
        extractedRecipe: null,
        extractionStatus: 'failed',
        extractionError: 'The AI model returned an error (HTTP 500)',
        warning: null,
      })
    );
    // raw title/description remain available in the stored metadata
    const setArg = last.set.mock.calls[0][0] as { resultMetadata: string };
    expect(JSON.parse(setArg.resultMetadata).infoJson).toEqual({
      title: 'Pizza Tacos',
      description: 'stuff',
    });
  });
});

// ---------------------------------------------------------------------------
// getVideoJobForFamily / createVideoJob familyId / reextractVideoJob
// ---------------------------------------------------------------------------

describe('family scoping and re-extraction', () => {
  it('createVideoJob stores the family id', async () => {
    const insert = makeInsert();
    mockDb.insert.mockReturnValue(insert);
    await createVideoJob('https://x/y', undefined, 'fam-1');
    expect(insert.values).toHaveBeenCalledWith(expect.objectContaining({ familyId: 'fam-1' }));
  });

  it('getVideoJobForFamily returns the job or null', async () => {
    mockDb.select.mockReturnValue(makeSelect([{ id: 'j1' }]));
    expect(await getVideoJobForFamily('j1', 'fam-1')).toEqual({ id: 'j1' });
    mockDb.select.mockReturnValue(makeSelect([]));
    expect(await getVideoJobForFamily('j1', 'fam-2')).toBeNull();
  });

  it('reextractVideoJob re-runs extraction from stored infoJson + transcript and updates the row', async () => {
    const stored = {
      id: 'j1',
      sourceUrl: 'https://www.tiktok.com/t/abc/',
      transcript: 'tr',
      resultMetadata: JSON.stringify({ infoJson: { title: 'T', description: 'D' } }),
    };
    mockDb.select.mockReturnValue(makeSelect([stored]));
    mockExtractRecipeFromMetadata.mockResolvedValue({
      recipe: { name: 'R', ingredients: [], tags: [] } as never,
      rawTitle: 'T',
      rawDescription: 'D',
      source: 'llm',
      status: 'llm',
      error: null,
    });
    const update = makeUpdate();
    mockDb.update.mockReturnValue(update);

    await reextractVideoJob('j1');

    expect(mockExtractRecipeFromMetadata).toHaveBeenCalledWith(
      { title: 'T', description: 'D' },
      'tr'
    );
    expect(update.set).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionStatus: 'llm',
        extractionError: null,
        extractedRecipe: expect.stringContaining('"name":"R"'),
      })
    );
  });

  it('reextractVideoJob returns null when there is no stored metadata', async () => {
    mockDb.select.mockReturnValue(makeSelect([{ id: 'j1', resultMetadata: null }]));
    expect(await reextractVideoJob('j1')).toBeNull();
    expect(mockExtractRecipeFromMetadata).not.toHaveBeenCalled();
  });
});
