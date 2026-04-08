import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// Mock child_process before importing the module under test
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

// Mock fs/promises for stat/readdir/mkdir/readFile
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
}));

import { spawn } from 'node:child_process';
import * as fsPromises from 'node:fs/promises';
import { downloadVideo, getVideoStorageUsage, ensureVideosDir } from '../videoDownload.js';

const mockSpawn = vi.mocked(spawn);
const mockStat = vi.mocked(fsPromises.stat);
const mockReaddir = vi.mocked(fsPromises.readdir);
const mockReadFile = vi.mocked(fsPromises.readFile);

/** Build a fake child process with stdout/stderr streams */
function makeChildProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  return proc;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// downloadVideo — happy path
// ---------------------------------------------------------------------------
describe('downloadVideo', () => {
  it('returns DownloadResult on success', async () => {
    const infoData = { title: 'Test Video', description: 'A test', duration: 120 };

    const child = makeChildProcess();
    mockSpawn.mockReturnValue(child as ReturnType<typeof spawn>);

    // Resolve after a tick
    setImmediate(() => child.emit('close', 0));

    mockStat.mockImplementation(async (filePath) => {
      const p = String(filePath);
      if (p.endsWith('.mp4')) return { size: 5_000_000, isFile: () => true } as fsPromises.Stats;
      if (p.endsWith('.jpg')) return { size: 50_000, isFile: () => true } as fsPromises.Stats;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    mockReadFile.mockResolvedValue(JSON.stringify(infoData) as unknown as Buffer);

    const result = await downloadVideo('https://www.youtube.com/watch?v=test');

    expect(result.videoFilename).toMatch(/^[0-9a-f-]+\.mp4$/);
    expect(result.thumbnailFilename).toMatch(/^[0-9a-f-]+\.jpg$/);
    expect(result.videoSize).toBe(5_000_000);
    expect(result.videoDuration).toBe(120);
    expect(result.infoJson).toEqual(infoData);
  });

  it('throws on yt-dlp non-zero exit', async () => {
    const child = makeChildProcess();
    mockSpawn.mockReturnValue(child as ReturnType<typeof spawn>);
    setImmediate(() => child.emit('close', 1));

    await expect(downloadVideo('https://www.youtube.com/watch?v=bad')).rejects.toThrow(
      'yt-dlp exited with code 1'
    );
  });

  it('handles missing thumbnail gracefully', async () => {
    const infoData = { duration: 60 };
    const child = makeChildProcess();
    mockSpawn.mockReturnValue(child as ReturnType<typeof spawn>);
    setImmediate(() => child.emit('close', 0));

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
    const child = makeChildProcess();
    mockSpawn.mockReturnValue(child as ReturnType<typeof spawn>);
    setImmediate(() => child.emit('close', 0));

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

  it('calls onProgress with parsed percentages from stderr', async () => {
    const child = makeChildProcess();
    mockSpawn.mockReturnValue(child as ReturnType<typeof spawn>);

    const onProgress = vi.fn();

    // Emit progress lines on stderr before close
    setImmediate(() => {
      child.stderr.emit('data', Buffer.from('[download]  10.0% of 50.00MiB\n'));
      child.stderr.emit('data', Buffer.from('[download]  50.5% of 50.00MiB\n'));
      child.stderr.emit('data', Buffer.from('[download]  99.9% of 50.00MiB\n'));
      child.emit('close', 0);
    });

    mockStat.mockResolvedValue({ size: 1000, isFile: () => true } as fsPromises.Stats);
    mockReadFile.mockResolvedValue(JSON.stringify({}) as unknown as Buffer);

    await downloadVideo('https://www.youtube.com/watch?v=progress', onProgress);

    expect(onProgress).toHaveBeenCalledWith(10);
    expect(onProgress).toHaveBeenCalledWith(50);
    // 99.9% floors to 99, capped at 99
    expect(onProgress).toHaveBeenCalledWith(99);
  });

  it('does not call onProgress when not provided', async () => {
    const child = makeChildProcess();
    mockSpawn.mockReturnValue(child as ReturnType<typeof spawn>);

    setImmediate(() => {
      child.stderr.emit('data', Buffer.from('[download]  25.0% of 50.00MiB\n'));
      child.emit('close', 0);
    });

    mockStat.mockResolvedValue({ size: 1000, isFile: () => true } as fsPromises.Stats);
    mockReadFile.mockResolvedValue(JSON.stringify({}) as unknown as Buffer);

    // Should not throw even without onProgress
    await expect(
      downloadVideo('https://www.youtube.com/watch?v=noprogress')
    ).resolves.toBeDefined();
  });

  it('rejects when child emits error event', async () => {
    const child = makeChildProcess();
    mockSpawn.mockReturnValue(child as ReturnType<typeof spawn>);
    setImmediate(() => child.emit('error', new Error('spawn ENOENT')));

    await expect(downloadVideo('https://www.youtube.com/watch?v=err')).rejects.toThrow(
      'spawn ENOENT'
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
