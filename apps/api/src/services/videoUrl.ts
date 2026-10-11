/**
 * Pure URL helpers for video import.
 */

const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com']);

// First path segments on tiktok.com that are real site sections, not short-link codes.
const TIKTOK_RESERVED_SEGMENTS = new Set([
  'discover',
  'tag',
  'music',
  't',
  'explore',
  'foryou',
  'following',
  'friends',
  'live',
  'upload',
  'login',
  'signup',
  'search',
  'trending',
  'messages',
  'inbox',
  'studio',
  'coin',
  'legal',
  'about',
  'privacy',
  'creators',
  'business',
  'effect',
  'embed',
  'video',
  'tv',
  'shop',
  'hashtag',
  'place',
  'topics',
  'download',
  'feedback',
  'safety',
  'jobs',
  'api',
  '404',
]);

/**
 * Rewrites a bare TikTok short code URL (https://(www.)tiktok.com/<code>) to the
 * resolvable form https://www.tiktok.com/t/<code>/. Anything else is returned unchanged.
 */
export function normalizeVideoUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return rawUrl;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return rawUrl;
  if (!TIKTOK_HOSTS.has(url.hostname.toLowerCase())) return rawUrl;

  const match = /^\/([A-Za-z0-9]+)\/?$/.exec(url.pathname);
  if (!match) return rawUrl;
  const code = match[1];
  if (TIKTOK_RESERVED_SEGMENTS.has(code.toLowerCase())) return rawUrl;

  return `https://www.tiktok.com/t/${code}/`;
}
