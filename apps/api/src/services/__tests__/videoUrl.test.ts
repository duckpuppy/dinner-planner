import { describe, it, expect } from 'vitest';
import { normalizeVideoUrl } from '../videoUrl.js';

describe('normalizeVideoUrl', () => {
  it('rewrites a bare TikTok short code (www)', () => {
    expect(normalizeVideoUrl('https://www.tiktok.com/ZPLhqTVQL')).toBe(
      'https://www.tiktok.com/t/ZPLhqTVQL/'
    );
  });

  it('rewrites without www, with trailing slash, and http', () => {
    expect(normalizeVideoUrl('https://tiktok.com/ZPLhqTVQL/')).toBe(
      'https://www.tiktok.com/t/ZPLhqTVQL/'
    );
    expect(normalizeVideoUrl('http://www.tiktok.com/ZPLhqTVQL')).toBe(
      'https://www.tiktok.com/t/ZPLhqTVQL/'
    );
  });

  it('trims surrounding whitespace and drops tracking query', () => {
    expect(normalizeVideoUrl('  https://www.tiktok.com/ZPLhqTVQL?_r=1 ')).toBe(
      'https://www.tiktok.com/t/ZPLhqTVQL/'
    );
  });

  it('leaves already-correct short links alone', () => {
    expect(normalizeVideoUrl('https://www.tiktok.com/t/ZPLhqTVQL/')).toBe(
      'https://www.tiktok.com/t/ZPLhqTVQL/'
    );
    expect(normalizeVideoUrl('https://vm.tiktok.com/ZPLhqTVQL/')).toBe(
      'https://vm.tiktok.com/ZPLhqTVQL/'
    );
  });

  it('leaves profile and full video URLs alone', () => {
    const profile = 'https://www.tiktok.com/@someone';
    const video = 'https://www.tiktok.com/@someone/video/7691473807076265246';
    expect(normalizeVideoUrl(profile)).toBe(profile);
    expect(normalizeVideoUrl(video)).toBe(video);
  });

  it.each(['discover', 'tag', 'music', 't', 'explore', 'foryou', 'following', 'live', 'upload'])(
    'leaves the known path /%s alone',
    (segment) => {
      const url = `https://www.tiktok.com/${segment}`;
      expect(normalizeVideoUrl(url)).toBe(url);
    }
  );

  it('leaves non-alphanumeric single segments alone', () => {
    const url = 'https://www.tiktok.com/some-thing';
    expect(normalizeVideoUrl(url)).toBe(url);
  });

  it('leaves the root and other hosts alone', () => {
    expect(normalizeVideoUrl('https://www.tiktok.com/')).toBe('https://www.tiktok.com/');
    expect(normalizeVideoUrl('https://www.youtube.com/abc123')).toBe(
      'https://www.youtube.com/abc123'
    );
    expect(normalizeVideoUrl('https://nottiktok.com/abc123')).toBe('https://nottiktok.com/abc123');
  });

  it('returns invalid input unchanged', () => {
    expect(normalizeVideoUrl('not a url')).toBe('not a url');
  });
});
