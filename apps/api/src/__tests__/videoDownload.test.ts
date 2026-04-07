/**
 * Unit tests for the videoDownload service.
 *
 * All filesystem and child_process calls are mocked so tests never
 * touch disk or spawn actual processes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const mockExecFile = vi.hoisted(() => vi.fn());
const mockMkdir = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockReadFile = vi.hoisted(() => vi.fn());
const mockUnlink = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockReaddir = vi.hoisted(() => vi.fn());
const mockStat = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execFile: vi.fn(), // raw callback version — we use promisify below
}));

vi.mock('node:util', () => ({
  promisify: vi.fn(() => mockExecFile),
}));

vi.mock('node:fs/promises', () => ({
  mkdir: mockMkdir,
  readFile: mockReadFile,
  unlink: mockUnlink,
  readdir: mockReaddir,
  stat: mockStat,
}));

vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto');
  return { ...actual, randomUUID: vi.fn().mockReturnValue('test-uuid-1234') };
});

// Import after mocks are in place
import {
  downloadVideo,
  getVideoStorageUsage,
  deleteVideo,
  getVideosDir,
} from '../services/videoDownload.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INFO_JSON = {
  title: 'Test Video',
  description: 'A test video',
  uploader: 'Test Channel',
  upload_date: '20240101',
  duration: 120,
};

function setupSuccessfulDownload() {
  mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });
  mockReadFile.mockResolvedValue(JSON.stringify(INFO_JSON));
  mockReaddir.mockResolvedValue([
    'test-uuid-1234.mp4',
    'test-uuid-1234.jpg',
    'test-uuid-1234.info.json',
  ]);
  mockStat.mockResolvedValue({ size: 1_048_576, isFile: () => true });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockMkdir.mockResolvedValue(undefined);
  mockUnlink.mockResolvedValue(undefined);
});

describe('getVideosDir', () => {
  it('returns the configured videos directory', () => {
    const dir = getVideosDir();
    expect(typeof dir).toBe('string');
    expect(dir.length).toBeGreaterThan(0);
  });
});

describe('downloadVideo', () => {
  it('returns DownloadResult on success', async () => {
    setupSuccessfulDownload();

    const result = await downloadVideo('https://www.youtube.com/watch?v=test');

    expect(result.videoFilename).toBe('test-uuid-1234.mp4');
    expect(result.thumbnailFilename).toBe('test-uuid-1234.jpg');
    expect(result.videoSize).toBe(1_048_576);
    expect(result.videoDuration).toBe(120);
    expect(result.infoJson.title).toBe('Test Video');
  });

  it('invokes yt-dlp with correct flags', async () => {
    setupSuccessfulDownload();

    await downloadVideo('https://example.com/video');

    expect(mockExecFile).toHaveBeenCalledOnce();
    const [bin, args] = mockExecFile.mock.calls[0] as [string, string[]];
    expect(bin).toBe('yt-dlp');
    expect(args).toContain('--merge-output-format');
    expect(args).toContain('mp4');
    expect(args).toContain('--no-playlist');
    expect(args).toContain('--max-filesize');
    expect(args).toContain('500M');
    expect(args).toContain('https://example.com/video');
  });

  it('uses YTDLP_PATH env var when set', async () => {
    setupSuccessfulDownload();
    const original = process.env.YTDLP_PATH;
    process.env.YTDLP_PATH = '/usr/local/bin/yt-dlp';

    await downloadVideo('https://example.com/video');

    const [bin] = mockExecFile.mock.calls[0] as [string, string[]];
    expect(bin).toBe('/usr/local/bin/yt-dlp');

    process.env.YTDLP_PATH = original;
  });

  it('throws when yt-dlp exits non-zero', async () => {
    mockMkdir.mockResolvedValue(undefined);
    mockExecFile.mockRejectedValue(
      Object.assign(new Error('exit code 1'), { stderr: 'ERROR: Unsupported URL', killed: false })
    );

    await expect(downloadVideo('https://example.com/bad')).rejects.toThrow(/yt-dlp failed/);
  });

  it('throws with timeout message when process is killed', async () => {
    mockMkdir.mockResolvedValue(undefined);
    mockExecFile.mockRejectedValue(
      Object.assign(new Error('killed'), { killed: true, stderr: '' })
    );

    await expect(downloadVideo('https://example.com/slow')).rejects.toThrow(/timed out/);
  });

  it('continues when info.json cannot be read', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockReaddir.mockResolvedValue(['test-uuid-1234.mp4']);
    mockStat.mockResolvedValue({ size: 500_000, isFile: () => true });

    const result = await downloadVideo('https://example.com/video');
    expect(result.videoFilename).toBe('test-uuid-1234.mp4');
    expect(result.infoJson).toEqual({});
    expect(result.videoDuration).toBeNull();
  });

  it('throws when no video file found after download', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });
    mockReadFile.mockResolvedValue(JSON.stringify({}));
    // Only sidecar files, no actual video
    mockReaddir.mockResolvedValue(['test-uuid-1234.info.json', 'test-uuid-1234.jpg']);

    await expect(downloadVideo('https://example.com/video')).rejects.toThrow(/no video file found/);
  });

  it('cleans up info.json after reading', async () => {
    setupSuccessfulDownload();

    await downloadVideo('https://example.com/video');

    expect(mockUnlink).toHaveBeenCalledWith(expect.stringContaining('.info.json'));
  });
});

describe('getVideoStorageUsage', () => {
  it('sums file sizes in VIDEOS_DIR', async () => {
    mockReaddir.mockResolvedValue(['a.mp4', 'b.mp4']);
    mockStat
      .mockResolvedValueOnce({ size: 1000, isFile: () => true })
      .mockResolvedValueOnce({ size: 2000, isFile: () => true });

    const usage = await getVideoStorageUsage();
    expect(usage).toBe(3000);
  });

  it('returns 0 when directory does not exist', async () => {
    mockReaddir.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const usage = await getVideoStorageUsage();
    expect(usage).toBe(0);
  });

  it('skips files that disappear mid-iteration', async () => {
    mockReaddir.mockResolvedValue(['good.mp4', 'gone.mp4']);
    mockStat
      .mockResolvedValueOnce({ size: 500, isFile: () => true })
      .mockRejectedValueOnce(new Error('ENOENT'));

    const usage = await getVideoStorageUsage();
    expect(usage).toBe(500);
  });

  it('skips directories (isFile returns false)', async () => {
    mockReaddir.mockResolvedValue(['subdir', 'video.mp4']);
    mockStat
      .mockResolvedValueOnce({ size: 0, isFile: () => false })
      .mockResolvedValueOnce({ size: 2048, isFile: () => true });

    const usage = await getVideoStorageUsage();
    expect(usage).toBe(2048);
  });
});

describe('deleteVideo', () => {
  it('deletes video and all associated sidecar files', async () => {
    mockReaddir.mockResolvedValue([
      'abc123.mp4',
      'abc123.jpg',
      'abc123.info.json',
      'other-uuid.mp4',
    ]);

    await deleteVideo('abc123.mp4');

    // Should delete the three abc123.* files but not other-uuid.mp4
    const deletedPaths = mockUnlink.mock.calls.map(([p]: [string]) => p);
    expect(deletedPaths.filter((p: string) => p.includes('abc123'))).toHaveLength(3);
    expect(deletedPaths.every((p: string) => !p.includes('other-uuid'))).toBe(true);
  });

  it('is a no-op when readdir fails', async () => {
    mockReaddir.mockRejectedValue(new Error('ENOENT'));

    await expect(deleteVideo('missing.mp4')).resolves.toBeUndefined();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('ignores unlink errors gracefully', async () => {
    mockReaddir.mockResolvedValue(['fail.mp4']);
    mockUnlink.mockRejectedValue(new Error('EPERM'));

    await expect(deleteVideo('fail.mp4')).resolves.toBeUndefined();
  });
});
