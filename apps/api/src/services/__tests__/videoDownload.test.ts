import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// Mock child_process before importing the module under test
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

// Mock fs/promises for stat/readdir/mkdir/readFile
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
}));

import { execFile } from 'node:child_process';
import * as fsPromises from 'node:fs/promises';
import { downloadVideo, getVideoStorageUsage, ensureVideosDir } from '../videoDownload.js';

const mockExecFile = vi.mocked(execFile);
const mockStat = vi.mocked(fsPromises.stat);
const mockReaddir = vi.mocked(fsPromises.readdir);
const mockReadFile = vi.mocked(fsPromises.readFile);

type ExecCallback = (err: Error | null) => void;

/** Build a fake ChildProcess-like emitter */
function makeChildProcess(): EventEmitter & { kill: ReturnType<typeof vi.fn> } {
  const emitter = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
  emitter.kill = vi.fn();
  return emitter;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// downloadVideo — happy path
// ---------------------------------------------------------------------------
describe('downloadVideo', () => {
  it('returns DownloadResult on success', async () => {
    const infoData = {
      title: 'Test Video',
      description: 'A test',
      duration: 120,
    };

    // execFile succeeds immediately
    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const child = makeChildProcess();
      setImmediate(() => (callback as ExecCallback)(null));
      return child as ReturnType<typeof execFile>;
    });

    // stat: video exists with 5MB size, thumbnail exists
    mockStat.mockImplementation(async (filePath) => {
      const p = String(filePath);
      if (p.endsWith('.mp4')) return { size: 5_000_000, isFile: () => true } as fsPromises.Stats;
      if (p.endsWith('.jpg')) return { size: 50_000, isFile: () => true } as fsPromises.Stats;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    // readFile returns info.json content
    mockReadFile.mockResolvedValue(JSON.stringify(infoData) as unknown as Buffer);

    const result = await downloadVideo('https://www.youtube.com/watch?v=test');

    expect(result.videoFilename).toMatch(/^[0-9a-f-]+\.mp4$/);
    expect(result.thumbnailFilename).toMatch(/^[0-9a-f-]+\.jpg$/);
    expect(result.videoSize).toBe(5_000_000);
    expect(result.videoDuration).toBe(120);
    expect(result.infoJson).toEqual(infoData);
  });

  it('throws on yt-dlp non-zero exit', async () => {
    const ytdlpError = new Error('yt-dlp exited with code 1');

    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const child = makeChildProcess();
      setImmediate(() => (callback as ExecCallback)(ytdlpError));
      return child as ReturnType<typeof execFile>;
    });

    await expect(downloadVideo('https://www.youtube.com/watch?v=bad')).rejects.toThrow(
      'yt-dlp exited with code 1'
    );
  });

  it('handles missing thumbnail gracefully', async () => {
    const infoData = { duration: 60 };

    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const child = makeChildProcess();
      setImmediate(() => (callback as ExecCallback)(null));
      return child as ReturnType<typeof execFile>;
    });

    mockStat.mockImplementation(async (filePath) => {
      const p = String(filePath);
      if (p.endsWith('.mp4')) return { size: 1_000_000, isFile: () => true } as fsPromises.Stats;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    mockReadFile.mockResolvedValue(JSON.stringify(infoData) as unknown as Buffer);

    const result = await downloadVideo('https://www.youtube.com/watch?v=test2');
    expect(result.thumbnailFilename).toBeNull();
  });

  it('handles missing info.json gracefully', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const child = makeChildProcess();
      setImmediate(() => (callback as ExecCallback)(null));
      return child as ReturnType<typeof execFile>;
    });

    mockStat.mockImplementation(async (filePath) => {
      const p = String(filePath);
      if (p.endsWith('.mp4')) return { size: 2_000_000, isFile: () => true } as fsPromises.Stats;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const result = await downloadVideo('https://www.youtube.com/watch?v=test3');
    expect(result.infoJson).toEqual({});
    expect(result.videoDuration).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// timeout handling
// ---------------------------------------------------------------------------
describe('downloadVideo timeout', () => {
  it('rejects when yt-dlp process errors with abort signal', async () => {
    const abortError = Object.assign(new Error('The operation was aborted'), {
      code: 'ABORT_ERR',
    });

    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const child = makeChildProcess();
      setImmediate(() => (callback as ExecCallback)(abortError));
      return child as ReturnType<typeof execFile>;
    });

    await expect(downloadVideo('https://www.youtube.com/watch?v=slow')).rejects.toThrow(
      'The operation was aborted'
    );
  });
});

// ---------------------------------------------------------------------------
// getVideoStorageUsage
// ---------------------------------------------------------------------------
describe('getVideoStorageUsage', () => {
  it('sums file sizes in VIDEOS_DIR', async () => {
    mockReaddir.mockResolvedValue([
      'a.mp4',
      'b.jpg',
      'c.info.json',
    ] as unknown as fsPromises.Dirent[]);
    mockStat.mockImplementation(
      async () => ({ size: 1000, isFile: () => true }) as fsPromises.Stats
    );

    const usage = await getVideoStorageUsage();
    expect(usage).toBe(3000);
  });

  it('returns 0 when directory does not exist', async () => {
    mockReaddir.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const usage = await getVideoStorageUsage();
    expect(usage).toBe(0);
  });

  it('skips files that cannot be stat-ed', async () => {
    mockReaddir.mockResolvedValue(['a.mp4', 'ghost.mp4'] as unknown as fsPromises.Dirent[]);
    mockStat.mockImplementation(async (filePath) => {
      if (String(filePath).includes('ghost')) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      }
      return { size: 2000, isFile: () => true } as fsPromises.Stats;
    });

    const usage = await getVideoStorageUsage();
    expect(usage).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// ensureVideosDir
// ---------------------------------------------------------------------------
describe('ensureVideosDir', () => {
  it('calls mkdir with recursive:true', async () => {
    const mockMkdir = vi.mocked(fsPromises.mkdir);
    await ensureVideosDir();
    expect(mockMkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });
});
