import { relative, sep } from 'node:path';

const NO_STORE = 'no-cache, no-store, must-revalidate';
// Revalidate on every use (conditional GET) but still allow storing. That is
// all these files need; no-store would only forbid useful conditional requests.
const REVALIDATE = 'no-cache';
const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHORT = 'public, max-age=86400';

const REVALIDATE_FILES = new Set(['sw.js', 'registerSW.js', 'manifest.webmanifest']);
const WORKBOX_RE = /^workbox-[A-Za-z0-9_-]+\.js$/;

/**
 * Cache-Control policy for a static file served from the web dist directory.
 *
 * @param filePath    absolute path of the file being served
 * @param webDistPath absolute path of the web dist root
 */
export function cacheControlFor(filePath: string, webDistPath: string): string {
  // Normalise to posix separators (handles both path.sep and '/').
  const rel = relative(webDistPath, filePath).split(sep).join('/');

  if (rel.toLowerCase().endsWith('.html')) return NO_STORE;
  if (REVALIDATE_FILES.has(rel)) return REVALIDATE;
  // Content-hashed build output
  if (rel.startsWith('assets/') || WORKBOX_RE.test(rel)) return IMMUTABLE;
  // Non-hashed files (icons, favicon, ...) must be able to refresh
  return SHORT;
}
