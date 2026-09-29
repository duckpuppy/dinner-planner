import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { cacheControlFor } from '../staticCacheHeaders.js';

const root = '/app/apps/web/dist';
const p = (rel: string) => join(root, rel);

describe('cacheControlFor', () => {
  it('never caches html', () => {
    const v = 'no-cache, no-store, must-revalidate';
    expect(cacheControlFor(p('index.html'), root)).toBe(v);
    expect(cacheControlFor(p('offline.html'), root)).toBe(v);
  });

  it('revalidates service worker and manifest files', () => {
    for (const f of ['sw.js', 'registerSW.js', 'manifest.webmanifest']) {
      expect(cacheControlFor(p(f), root)).toBe('no-cache');
    }
  });

  it('marks content-hashed files immutable', () => {
    const v = 'public, max-age=31536000, immutable';
    expect(cacheControlFor(p('assets/index-abc123.js'), root)).toBe(v);
    expect(cacheControlFor(p('assets/x.css'), root)).toBe(v);
    expect(cacheControlFor(p('workbox-1a2b3c4d.js'), root)).toBe(v);
  });

  it('gives non-hashed files a short cache', () => {
    const v = 'public, max-age=86400';
    expect(cacheControlFor(p('pwa-192x192.png'), root)).toBe(v);
    expect(cacheControlFor(p('icon.svg'), root)).toBe(v);
    expect(cacheControlFor(p('icons/nested/logo.png'), root)).toBe(v);
  });

  it('does not treat lookalike names in subdirectories as special', () => {
    expect(cacheControlFor(p('icons/sw.js'), root)).toBe('public, max-age=86400');
    expect(cacheControlFor(p('icons/workbox-abc.js'), root)).toBe('public, max-age=86400');
  });
});
