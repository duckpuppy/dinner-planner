/**
 * Runtime switches for video import. Read lazily from process.env so tests can toggle them.
 */

/** VIDEO_IMPORT_COMMENTS=true makes yt-dlp fetch a few comments to feed recipe extraction. */
export function isVideoCommentsEnabled(): boolean {
  const v = process.env.VIDEO_IMPORT_COMMENTS;
  return v === 'true' || v === '1';
}

/** Max comments requested from yt-dlp (YouTube only; see docs/README note). */
export const VIDEO_IMPORT_MAX_COMMENTS = 30;
