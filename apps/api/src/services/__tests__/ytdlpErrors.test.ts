import { describe, it, expect } from 'vitest';
import {
  appendTail,
  buildExitError,
  extractErrorLines,
  friendlyYtdlpMessage,
  MAX_STDERR_TAIL,
} from '../ytdlpErrors.js';

describe('appendTail', () => {
  it('keeps only the last MAX_STDERR_TAIL characters', () => {
    const tail = appendTail('a'.repeat(MAX_STDERR_TAIL), 'END');
    expect(tail.length).toBe(MAX_STDERR_TAIL);
    expect(tail.endsWith('END')).toBe(true);
  });
});

describe('extractErrorLines', () => {
  it('returns the last ERROR lines without the prefix', () => {
    const stderr = '[generic] x\nERROR: first\n[info] y\nERROR: [generic] Unsupported URL: z\n';
    expect(extractErrorLines(stderr)).toBe('first | [generic] Unsupported URL: z');
  });

  it('returns null when there is no ERROR line', () => {
    expect(extractErrorLines('[download] 10%\n')).toBeNull();
  });
});

describe('friendlyYtdlpMessage', () => {
  it.each([
    [
      '[generic] Unsupported URL: https://www.tiktok.com/404?fromUrl=/x',
      "This link doesn't point to a video",
    ],
    ['[youtube] abc: Private video. Sign in', 'private'],
    ['[youtube] abc: Sign in to confirm your age', 'requires a login'],
    ['[youtube] abc: The uploader has not made this video available in your country', 'region'],
    ['[youtube] abc: Video unavailable', 'removed'],
    ['[TikTok] 123: This video has been removed', 'removed'],
  ])('maps %s', (raw, expected) => {
    expect(friendlyYtdlpMessage(raw)).toContain(expected);
  });

  it('quotes and truncates unmapped errors', () => {
    const msg = friendlyYtdlpMessage('weird failure ' + 'z'.repeat(500));
    expect(msg.startsWith('Could not download the video: weird failure')).toBe(true);
    expect(msg.length).toBeLessThan(360);
  });
});

describe('buildExitError', () => {
  it('uses the friendly message and keeps the raw detail', () => {
    const err = buildExitError(1, 'ERROR: [generic] Unsupported URL: https://x/404\n');
    expect(err.message).toContain("doesn't point to a video");
    expect(err.detail).toBe('[generic] Unsupported URL: https://x/404');
    expect(err.code).toBe('YTDLP_FAILED');
  });

  it('falls back to the exit code when stderr has no ERROR line', () => {
    expect(buildExitError(1, '').message).toBe('yt-dlp exited with code 1');
  });
});
