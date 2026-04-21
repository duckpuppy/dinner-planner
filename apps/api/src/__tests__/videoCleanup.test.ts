/**
 * Unit tests for the videoCleanup service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockReaddir = vi.hoisted(() => vi.fn<() => Promise<string[]>>());
const mockStat = vi.hoisted(() =>
  vi.fn<() => Promise<{ isFile: () => boolean; mtimeMs: number; size: number }>>()
);
const mockDeleteVideo = vi.hoisted(() => vi.fn<() => Promise<void>>().mockResolvedValue(undefined));

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readdir: mockReaddir,
  stat: mockStat,
}));

vi.mock('../services/videoDownload.js', () => ({
  VIDEOS_DIR: '/fake/videos',
  deleteVideo: mockDeleteVideo,
}));

vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    dishes: { localVideoFilename: null },
    videoJobs: { resultVideoFilename: null },
  },
}));

vi.mock('drizzle-orm', () => ({}));

vi.mock('../services/appEvents.js', () => ({
  logEvent: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { cleanupOrphanedVideos } from '../services/videoCleanup.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake stat result */
function fakeStat(opts: { isFile?: boolean; mtimeMs?: number; size?: number } = {}) {
  return {
    isFile: () => opts.isFile ?? true,
    mtimeMs: opts.mtimeMs ?? Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago by default
    size: opts.size ?? 1024,
  };
}

/**
 * Set up the two DB select chains used by cleanupOrphanedVideos:
 *   db.select().from(dishes).all()
 *   db.select().from(videoJobs).all()
 */
function setupDbSelects(dishFilenames: (string | null)[], jobFilenames: (string | null)[]) {
  const makeChain = (rows: unknown[]) => ({
    from: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue(rows) }),
  });

  mockDb.select
    .mockReturnValueOnce(makeChain(dishFilenames.map((f) => ({ localVideoFilename: f }))))
    .mockReturnValueOnce(makeChain(jobFilenames.map((f) => ({ resultVideoFilename: f }))));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  mockDeleteVideo.mockResolvedValue(undefined);
});

describe('cleanupOrphanedVideos', () => {
  it('returns empty result when VIDEOS_DIR does not exist', async () => {
    mockReaddir.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const result = await cleanupOrphanedVideos();

    expect(result.deletedFiles).toHaveLength(0);
    expect(result.freedBytes).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockDeleteVideo).not.toHaveBeenCalled();
  });

  it('returns empty result when VIDEOS_DIR is empty', async () => {
    mockReaddir.mockResolvedValueOnce([]);
    setupDbSelects([], []);

    const result = await cleanupOrphanedVideos();

    expect(result.deletedFiles).toHaveLength(0);
    expect(result.freedBytes).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockDeleteVideo).not.toHaveBeenCalled();
  });

  it('skips files referenced by a dish localVideoFilename', async () => {
    const uuid = 'aaaabbbb-0000-0000-0000-000000000001';
    mockReaddir.mockResolvedValueOnce([`${uuid}.mp4`]);
    mockStat.mockResolvedValueOnce(fakeStat());
    setupDbSelects([`${uuid}.mp4`], []);

    const result = await cleanupOrphanedVideos();

    expect(result.deletedFiles).toHaveLength(0);
    expect(mockDeleteVideo).not.toHaveBeenCalled();
  });

  it('skips files referenced by a videoJob resultVideoFilename', async () => {
    const uuid = 'aaaabbbb-0000-0000-0000-000000000002';
    mockReaddir.mockResolvedValueOnce([`${uuid}.mp4`]);
    mockStat.mockResolvedValueOnce(fakeStat());
    setupDbSelects([], [`${uuid}.mp4`]);

    const result = await cleanupOrphanedVideos();

    expect(result.deletedFiles).toHaveLength(0);
    expect(mockDeleteVideo).not.toHaveBeenCalled();
  });

  it('deletes orphaned files that are older than 1 hour', async () => {
    const uuid = 'aaaabbbb-0000-0000-0000-000000000003';
    const filename = `${uuid}.mp4`;
    const fileSize = 5 * 1024 * 1024; // 5 MB

    mockReaddir.mockResolvedValueOnce([filename]);
    mockStat.mockResolvedValueOnce(fakeStat({ size: fileSize }));
    setupDbSelects([], []);

    const result = await cleanupOrphanedVideos();

    expect(result.deletedFiles).toEqual([filename]);
    expect(result.freedBytes).toBe(fileSize);
    expect(result.errors).toHaveLength(0);
    expect(mockDeleteVideo).toHaveBeenCalledWith(filename);
  });

  it('skips orphaned files modified within the last hour', async () => {
    const uuid = 'aaaabbbb-0000-0000-0000-000000000004';
    const filename = `${uuid}.mp4`;
    const recentMtime = Date.now() - 30 * 60 * 1000; // 30 minutes ago

    mockReaddir.mockResolvedValueOnce([filename]);
    mockStat.mockResolvedValueOnce(fakeStat({ mtimeMs: recentMtime }));
    setupDbSelects([], []);

    const result = await cleanupOrphanedVideos();

    expect(result.deletedFiles).toHaveLength(0);
    expect(mockDeleteVideo).not.toHaveBeenCalled();
  });

  it('handles companion files (.info.json, .jpg) with the same UUID as the referenced file', async () => {
    const uuid = 'aaaabbbb-0000-0000-0000-000000000005';
    // Dish references the .mp4; companion files share the same UUID → all should be kept
    mockReaddir.mockResolvedValueOnce([`${uuid}.mp4`, `${uuid}.info.json`, `${uuid}.jpg`]);
    mockStat
      .mockResolvedValueOnce(fakeStat())
      .mockResolvedValueOnce(fakeStat())
      .mockResolvedValueOnce(fakeStat());
    setupDbSelects([`${uuid}.mp4`], []);

    const result = await cleanupOrphanedVideos();

    expect(result.deletedFiles).toHaveLength(0);
    expect(mockDeleteVideo).not.toHaveBeenCalled();
  });

  it('tracks errors without throwing when deleteVideo fails', async () => {
    const uuid = 'aaaabbbb-0000-0000-0000-000000000006';
    const filename = `${uuid}.mp4`;

    mockReaddir.mockResolvedValueOnce([filename]);
    mockStat.mockResolvedValueOnce(fakeStat());
    mockDeleteVideo.mockRejectedValueOnce(new Error('Permission denied'));
    setupDbSelects([], []);

    const result = await cleanupOrphanedVideos();

    expect(result.deletedFiles).toHaveLength(0);
    expect(result.freedBytes).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Permission denied');
  });

  it('skips non-file directory entries', async () => {
    const uuid = 'aaaabbbb-0000-0000-0000-000000000007';
    mockReaddir.mockResolvedValueOnce([uuid]); // looks like a dir entry
    mockStat.mockResolvedValueOnce(fakeStat({ isFile: false }));
    setupDbSelects([], []);

    const result = await cleanupOrphanedVideos();

    expect(result.deletedFiles).toHaveLength(0);
    expect(mockDeleteVideo).not.toHaveBeenCalled();
  });

  it('handles multiple orphaned files and sums freed bytes', async () => {
    const uuid1 = 'aaaabbbb-0000-0000-0000-000000000008';
    const uuid2 = 'aaaabbbb-0000-0000-0000-000000000009';

    mockReaddir.mockResolvedValueOnce([`${uuid1}.mp4`, `${uuid2}.mp4`]);
    mockStat
      .mockResolvedValueOnce(fakeStat({ size: 1000 }))
      .mockResolvedValueOnce(fakeStat({ size: 2000 }));
    setupDbSelects([], []);

    const result = await cleanupOrphanedVideos();

    expect(result.deletedFiles).toHaveLength(2);
    expect(result.freedBytes).toBe(3000);
  });

  it('handles null filenames in DB rows gracefully', async () => {
    mockReaddir.mockResolvedValueOnce([]);
    setupDbSelects([null, null], [null]);

    const result = await cleanupOrphanedVideos();

    expect(result.deletedFiles).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
