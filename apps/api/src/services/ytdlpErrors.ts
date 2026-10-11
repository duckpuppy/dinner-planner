/**
 * Helpers for turning yt-dlp stderr into short, user-friendly error messages.
 */

export const MAX_STDERR_TAIL = 4096;

export class YtdlpError extends Error {
  /** TIMEOUT for aborted runs, YTDLP_FAILED for non-zero exits */
  code: 'TIMEOUT' | 'YTDLP_FAILED';
  /** Raw "ERROR:" text from yt-dlp (or the exit-code message), for logs */
  detail: string;

  constructor(message: string, code: 'TIMEOUT' | 'YTDLP_FAILED', detail: string) {
    super(message);
    this.name = 'YtdlpError';
    this.code = code;
    this.detail = detail;
  }
}

/** Append to a rolling stderr buffer, keeping only the last MAX_STDERR_TAIL chars. */
export function appendTail(tail: string, chunk: string): string {
  const next = tail + chunk;
  return next.length > MAX_STDERR_TAIL ? next.slice(next.length - MAX_STDERR_TAIL) : next;
}

/** Last "ERROR:" lines (up to 2) from a stderr tail, or null if there are none. */
export function extractErrorLines(stderrTail: string): string | null {
  const lines = stderrTail
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^ERROR:/i.test(l));
  if (lines.length === 0) return null;
  return lines
    .slice(-2)
    .map((l) => l.replace(/^ERROR:\s*/i, ''))
    .join(' | ');
}

/** Map a raw yt-dlp error string to a friendly message. Unmapped errors are quoted briefly. */
export function friendlyYtdlpMessage(errorText: string): string {
  if (/unsupported url|\/404\b/i.test(errorText)) {
    return "This link doesn't point to a video - check it's a full share link";
  }
  if (/private/i.test(errorText)) {
    return 'This video is private, so it cannot be imported';
  }
  if (/login required|log in|sign in|requires? (a )?login|cookies/i.test(errorText)) {
    return 'This video requires a login, so it cannot be imported';
  }
  if (/geo|your country|not available in your|region/i.test(errorText)) {
    return "This video isn't available in the server's region";
  }
  if (
    /removed|deleted|no longer available|unavailable|not found|does not exist|\b404\b/i.test(
      errorText
    )
  ) {
    return 'This video has been removed or is no longer available';
  }
  const trimmed = errorText.length > 300 ? errorText.slice(0, 300) + '...' : errorText;
  return `Could not download the video: ${trimmed}`;
}

/** Build the thrown error for a non-zero yt-dlp exit. */
export function buildExitError(code: number | null, stderrTail: string): YtdlpError {
  const errorText = extractErrorLines(stderrTail);
  if (!errorText) {
    const msg = `yt-dlp exited with code ${code}`;
    return new YtdlpError(msg, 'YTDLP_FAILED', msg);
  }
  return new YtdlpError(friendlyYtdlpMessage(errorText), 'YTDLP_FAILED', errorText);
}
