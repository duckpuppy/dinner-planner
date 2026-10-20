/**
 * Clean the title of a social-media post (as returned by yt-dlp).
 *
 * Some extractors (notably Facebook) return the post's engagement line
 * ("978K views · 16K reactions") or a placeholder ("Facebook video #123") as the title.
 * Those are replaced by the first line of the description, tidied up; normal titles are
 * returned unchanged (trimmed). Returns '' when there is nothing usable.
 */

const STAT_SEGMENT = String.raw`[\d.,]+\s*[KMB]?\s+(?:views?|reactions?|likes?|plays?|comments?|shares?)\b`;
const STAT_SEPARATOR = String.raw`\s*[·|,\-–—•]\s*`;
const STATS_ONLY_RE = new RegExp(
  `^\\s*${STAT_SEGMENT}(?:${STAT_SEPARATOR}${STAT_SEGMENT})*[\\s·|,\\-–—•]*$`,
  'i'
);
const PLACEHOLDER_RE =
  /^\s*(?:facebook|instagram|tiktok)\s+(?:video|reel|post)\b\s*#?\s*[\w-]*\s*$/i;

const MAX_FALLBACK_LENGTH = 80;

const EMOJI_RE = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|‍|︎|️|⃣/gu;
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;

function isJunkTitle(title: string): boolean {
  return title === '' || STATS_ONLY_RE.test(title) || PLACEHOLDER_RE.test(title);
}

function trimEdges(s: string): string {
  return s
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[^\p{L}\p{N}]+$/u, '')
    .trim();
}

function stripDecoration(line: string): string {
  return trimEdges(line.replace(HASHTAG_RE, '').replace(EMOJI_RE, '').replace(/\s+/g, ' '));
}

function titleFromDescription(description: string): string {
  let text = '';
  for (const line of description.split(/\r?\n/)) {
    text = stripDecoration(line);
    if (text) break;
  }
  if (!text) return '';
  if (text.length <= MAX_FALLBACK_LENGTH) return text;
  const cut = text.slice(0, MAX_FALLBACK_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > MAX_FALLBACK_LENGTH / 2 ? cut.slice(0, lastSpace) : cut;
  return `${trimEdges(base)}…`;
}

export function cleanPostTitle(title: string, description: string): string {
  const trimmed = (title ?? '').trim();
  if (!isJunkTitle(trimmed)) return trimmed;
  return titleFromDescription(description ?? '');
}
