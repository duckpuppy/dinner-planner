/**
 * Unit tests for the videoJobs service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockDb = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue('__eq__'),
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    videoJobs: {
      id: 'id',
      status: 'status',
    },
  },
}));

// Mock the download service so tests stay pure
const mockDownloadVideo = vi.hoisted(() => vi.fn());
const mockGetVideoStorageUsage = vi.hoisted(() => vi.fn());

vi.mock('../services/videoDownload.js', () => ({
  downloadVideo: mockDownloadVideo,
  getVideoStorageUsage: mockGetVideoStorageUsage,
}));

vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto');
  return { ...actual, randomUUID: vi.fn().mockReturnValue('job-uuid-5678') };
});

import {
  createVideoJob,
  getVideoJob,
  listVideoJobs,
  processVideoJob,
} from '../services/videoJobs.js';

// ---------------------------------------------------------------------------
// DB chain helpers
// ---------------------------------------------------------------------------

function makeInsert() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

function makeSelect(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function makeSelectAll(rows: unknown[]) {
  return {
    from: vi.fn().mockResolvedValue(rows),
  };
}

// Shared update mock that accumulates all .set() call args across the test
let capturedSetArgs: Record<string, unknown>[] = [];
function makeTrackingUpdate() {
  return {
    set: vi.fn((data: Record<string, unknown>) => {
      capturedSetArgs.push(data);
      return { where: vi.fn().mockResolvedValue(undefined) };
    }),
  };
}

const MOCK_JOB = {
  id: 'job-uuid-5678',
  dishId: null,
  sourceUrl: 'https://www.youtube.com/watch?v=test',
  status: 'pending',
  progress: 0,
  resultVideoFilename: null,
  resultMetadata: null,
  extractedRecipe: null,
  error: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  capturedSetArgs = [];
});

describe('createVideoJob', () => {
  it('inserts a pending job and returns the generated ID', async () => {
    mockDb.insert.mockReturnValueOnce(makeInsert());

    const id = await createVideoJob('https://www.youtube.com/watch?v=test');

    expect(id).toBe('job-uuid-5678');
    expect(mockDb.insert).toHaveBeenCalledOnce();
    const insertValues = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertValues.status).toBe('pending');
    expect(insertValues.progress).toBe(0);
    expect(insertValues.dishId).toBeNull();
  });

  it('sets dishId when provided', async () => {
    mockDb.insert.mockReturnValueOnce(makeInsert());

    await createVideoJob('https://example.com/video', 'dish-abc');

    const insertValues = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(insertValues.dishId).toBe('dish-abc');
  });
});

describe('getVideoJob', () => {
  it('returns the job when found', async () => {
    mockDb.select.mockReturnValueOnce(makeSelect([MOCK_JOB]));

    const job = await getVideoJob('job-uuid-5678');

    expect(job).toEqual(MOCK_JOB);
  });

  it('returns null when not found', async () => {
    mockDb.select.mockReturnValueOnce(makeSelect([]));

    const job = await getVideoJob('nonexistent');

    expect(job).toBeNull();
  });
});

describe('listVideoJobs', () => {
  it('returns all jobs', async () => {
    mockDb.select.mockReturnValueOnce(makeSelectAll([MOCK_JOB]));

    const jobs = await listVideoJobs();

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual(MOCK_JOB);
  });

  it('returns empty array when no jobs', async () => {
    mockDb.select.mockReturnValueOnce(makeSelectAll([]));

    const jobs = await listVideoJobs();

    expect(jobs).toHaveLength(0);
  });
});

describe('processVideoJob', () => {
  const DOWNLOAD_RESULT = {
    videoFilename: 'job-uuid-5678.mp4',
    thumbnailFilename: 'job-uuid-5678.jpg',
    infoJson: {
      title: 'Test Video',
      description: 'Desc',
      uploader: 'Channel',
      upload_date: '20240101',
    },
    videoSize: 1_048_576,
    videoDuration: 90,
  };

  function setupProcess(storageUsed = 0) {
    mockGetVideoStorageUsage.mockResolvedValue(storageUsed);
    mockDownloadVideo.mockResolvedValue(DOWNLOAD_RESULT);
    mockDb.select.mockReturnValueOnce(makeSelect([MOCK_JOB]));
    mockDb.update.mockReturnValue(makeTrackingUpdate());
  }

  it('transitions job to complete on successful download', async () => {
    setupProcess(0);

    await processVideoJob('job-uuid-5678', 0);

    expect(capturedSetArgs.some((a) => a['status'] === 'downloading')).toBe(true);
    expect(capturedSetArgs.some((a) => a['status'] === 'complete')).toBe(true);
  });

  it('stores video filename and metadata on completion', async () => {
    setupProcess(0);

    await processVideoJob('job-uuid-5678', 0);

    const completionUpdate = capturedSetArgs.find((a) => a['status'] === 'complete');
    expect(completionUpdate?.['resultVideoFilename']).toBe('job-uuid-5678.mp4');
    expect(typeof completionUpdate?.['resultMetadata']).toBe('string');
    const meta = JSON.parse(completionUpdate?.['resultMetadata'] as string) as Record<
      string,
      unknown
    >;
    expect(meta['title']).toBe('Test Video');
    expect(meta['duration']).toBe(90);
  });

  it('sets status to failed when storage limit reached', async () => {
    mockGetVideoStorageUsage.mockResolvedValue(600 * 1024 * 1024); // 600 MB used
    mockDb.select.mockReturnValueOnce(makeSelect([MOCK_JOB]));
    mockDb.update.mockReturnValue(makeTrackingUpdate());

    await processVideoJob('job-uuid-5678', 500); // limit 500 MB

    expect(capturedSetArgs.some((a) => a['status'] === 'failed')).toBe(true);
    const failUpdate = capturedSetArgs.find((a) => a['status'] === 'failed');
    expect(String(failUpdate?.['error'])).toMatch(/Storage limit/);
    expect(mockDownloadVideo).not.toHaveBeenCalled();
  });

  it('does not enforce storage limit when storageLimitMb is 0', async () => {
    setupProcess(999 * 1024 * 1024); // 999 MB used — still allowed

    await processVideoJob('job-uuid-5678', 0);

    expect(mockDownloadVideo).toHaveBeenCalledOnce();
  });

  it('sets status to failed and rethrows on download error', async () => {
    mockGetVideoStorageUsage.mockResolvedValue(0);
    mockDownloadVideo.mockRejectedValue(new Error('yt-dlp failed: Unsupported URL'));
    mockDb.select.mockReturnValueOnce(makeSelect([MOCK_JOB]));
    mockDb.update.mockReturnValue(makeTrackingUpdate());

    await expect(processVideoJob('job-uuid-5678', 0)).rejects.toThrow('yt-dlp failed');

    expect(capturedSetArgs.some((a) => a['status'] === 'failed')).toBe(true);
    const failUpdate = capturedSetArgs.find((a) => a['status'] === 'failed');
    expect(String(failUpdate?.['error'])).toContain('yt-dlp failed');
  });

  it('throws when job not found', async () => {
    mockDb.select.mockReturnValueOnce(makeSelect([]));

    await expect(processVideoJob('nonexistent', 0)).rejects.toThrow('Video job not found');
  });
});
