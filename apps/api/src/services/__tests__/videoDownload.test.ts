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
import {
  downloadVideo,
  getVideoStorageUsage,
  ensureVideosDir,
  parseVtt,
} from '../videoDownload.js';

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

// ---------------------------------------------------------------------------
// parseVtt
// ---------------------------------------------------------------------------
describe('parseVtt', () => {
  it('parses standard VTT and returns deduplicated text joined by spaces', () => {
    const vtt = `WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:03.000
today we're making pasta

00:00:03.000 --> 00:00:06.000
today we're making pasta
with a simple tomato sauce

00:00:06.000 --> 00:00:09.000
with a simple tomato sauce
you'll need garlic and olive oil
`;
    const result = parseVtt(vtt);
    expect(result).toBe(
      "today we're making pasta with a simple tomato sauce you'll need garlic and olive oil"
    );
  });

  it('strips HTML formatting tags from cue text', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:03.000
<c>Hello</c> <b>world</b>
`;
    const result = parseVtt(vtt);
    expect(result).toBe('Hello world');
  });

  it('decodes HTML entities', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:03.000
Pasta &amp; sauce &lt;hot&gt; with&nbsp;oil
`;
    const result = parseVtt(vtt);
    expect(result).toBe('Pasta & sauce <hot> with oil');
  });

  it('returns empty string for VTT with no text content', () => {
    const vtt = `WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:03.000

00:00:03.000 --> 00:00:06.000
`;
    const result = parseVtt(vtt);
    expect(result).toBe('');
  });

  it('returns empty string for a bare WEBVTT header only', () => {
    const result = parseVtt('WEBVTT\n');
    expect(result).toBe('');
  });

  it('skips NOTE blocks', () => {
    const vtt = `WEBVTT

NOTE This is a comment

00:00:00.000 --> 00:00:03.000
actual text
`;
    const result = parseVtt(vtt);
    expect(result).toBe('actual text');
  });

  it('deduplicates repeated lines from overlapping cue windows', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:03.000
line one

00:00:02.000 --> 00:00:05.000
line one
line two

00:00:04.000 --> 00:00:07.000
line two
line three
`;
    const result = parseVtt(vtt);
    expect(result).toBe('line one line two line three');
  });

  it('handles yt-dlp timestamp-prefixed cue identifiers (numeric lines)', () => {
    const vtt = `WEBVTT

1
00:00:00.000 --> 00:00:03.000
first line

2
00:00:03.000 --> 00:00:06.000
second line
`;
    const result = parseVtt(vtt);
    expect(result).toBe('first line second line');
  });

  it('preserves non-adjacent duplicate lines separated by distinct content', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:03.000
add that in

00:00:03.000 --> 00:00:06.000
now let it simmer for ten minutes

00:00:06.000 --> 00:00:09.000
stir occasionally

00:01:00.000 --> 00:01:03.000
add that in

00:01:03.000 --> 00:01:06.000
and serve immediately
`;
    const result = parseVtt(vtt);
    expect(result).toBe(
      'add that in now let it simmer for ten minutes stir occasionally add that in and serve immediately'
    );
  });

  it('preserves a standalone numeric line not followed by a timestamp line', () => {
    const vtt = `WEBVTT

00:00:00.000 --> 00:00:03.000
preheat the oven to

00:00:03.000 --> 00:00:06.000
350
`;
    const result = parseVtt(vtt);
    expect(result).toBe('preheat the oven to 350');
  });
});

// ---------------------------------------------------------------------------
// downloadVideo — subtitle file selection
// ---------------------------------------------------------------------------
describe('downloadVideo subtitle selection', () => {
  it('prefers manual subtitles over auto-generated when both are present', async () => {
    const child = makeChildProcess();
    mockSpawn.mockReturnValue(child as ReturnType<typeof spawn>);
    setImmediate(() => child.emit('close', 0));

    mockStat.mockImplementation(async (filePath) => {
      const p = String(filePath);
      if (p.endsWith('.mp4')) return { size: 1_000_000, isFile: () => true } as fsPromises.Stats;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    let capturedUuid = '';
    mockReaddir.mockImplementation(async () => {
      // Grab the uuid from the most recent spawn call's output template arg
      const args = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1]?.[1] as string[];
      const outputArgIdx = args.indexOf('-o');
      const outputTemplate = args[outputArgIdx + 1];
      capturedUuid = outputTemplate.split('.%(ext)s')[0].split('/').pop() as string;
      return [
        `${capturedUuid}.en-orig.vtt`,
        `${capturedUuid}.en.vtt`,
        `${capturedUuid}.mp4`,
      ] as unknown as fsPromises.Dirent[];
    });

    mockReadFile.mockImplementation(async (filePath) => {
      const p = String(filePath);
      if (p.endsWith('.info.json')) {
        return JSON.stringify({}) as unknown as Buffer;
      }
      if (p.endsWith('.en.vtt')) {
        return 'WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nmanual transcript\n' as unknown as Buffer;
      }
      if (p.endsWith('.en-orig.vtt')) {
        return 'WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nauto transcript\n' as unknown as Buffer;
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const result = await downloadVideo('https://www.youtube.com/watch?v=subtest');
    expect(result.transcript).toBe('manual transcript');
  });
});
