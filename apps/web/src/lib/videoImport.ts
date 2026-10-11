import type { CreateDishData, VideoJob } from '@/lib/api';

const MAX_TITLE_LENGTH = 80;

// Emoji, pictographs, variation selectors, ZWJ, keycaps, skin-tone modifiers, regional flags.
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|‍|︎|️|⃣/gu;
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;
// "Ingredients:", "Directions:" ... — a label that starts the body of the post.
const LABEL_RE =
  /\b(?:ingredients?|directions?|instructions?|method|steps?|recipe|you(?:'ll| will)? need|what you need)\s*[:：]/i;
const SENTENCE_END_RE = /[.!?](?:\s|$)/;

function trimDecoration(s: string): string {
  return s
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[\s\-–—|:,;~*_•·./\\]+$/u, '')
    .trim();
}

/**
 * Heuristically turn a social-media post title into a dish name.
 *
 * Rules, in order: strip emoji and #hashtags; keep only the first non-empty line; cut at an
 * "Ingredients:"-style label (when it is not the very start); cut at the first sentence
 * boundary (. ! ?) or " | " separator; trim decoration from both ends; cap at ~80 chars on a
 * word boundary. Returns '' when nothing usable remains.
 */
export function cleanVideoTitle(raw: string | null | undefined): string {
  if (!raw) return '';
  let text = raw.replace(EMOJI_RE, '').replace(HASHTAG_RE, '');
  text = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  text = text.replace(/\s+/g, ' ').trim();

  const label = LABEL_RE.exec(text);
  if (label && label.index > 0) text = text.slice(0, label.index);

  const sentence = SENTENCE_END_RE.exec(text);
  if (sentence && sentence.index > 0) text = text.slice(0, sentence.index);

  const pipe = text.indexOf(' | ');
  if (pipe > 0) text = text.slice(0, pipe);

  text = trimDecoration(text);

  if (text.length > MAX_TITLE_LENGTH) {
    const cut = text.slice(0, MAX_TITLE_LENGTH);
    const lastSpace = cut.lastIndexOf(' ');
    text = trimDecoration(lastSpace > MAX_TITLE_LENGTH / 2 ? cut.slice(0, lastSpace) : cut);
  }
  return text;
}

/** Minimal dish prefill built from the post when no recipe could be extracted. */
export function buildFallbackDraft(job: VideoJob): CreateDishData {
  const meta = job.resultMetadata ?? {};
  const title = job.rawTitle ?? (typeof meta.title === 'string' ? meta.title : null);
  const description =
    job.rawDescription ?? (typeof meta.description === 'string' ? meta.description : '');
  return {
    name: cleanVideoTitle(title),
    description: description ?? '',
    type: 'main',
    sourceUrl: job.sourceUrl,
    ingredients: [],
  };
}

/** Merge an extracted recipe into a draft without clobbering fields the user has edited. */
export function mergeExtractedRecipe(
  draft: CreateDishData,
  recipe: CreateDishData,
  edited: { name: boolean; description: boolean }
): CreateDishData {
  return {
    ...recipe,
    name: edited.name ? draft.name : recipe.name || draft.name,
    description: edited.description ? draft.description : recipe.description || draft.description,
    sourceUrl: recipe.sourceUrl ?? draft.sourceUrl,
  };
}

/** User-facing notice for a completed job that has no extracted recipe. */
export function extractionNotice(job: VideoJob): string | null {
  switch (job.extractionStatus) {
    case 'failed':
      return `AI recipe extraction failed — prefilled from the post.${
        job.extractionError ? ` ${job.extractionError}` : ''
      }`;
    case 'disabled':
      return 'AI extraction is turned off (Admin → Settings) — prefilled from the post.';
    case 'no_description':
      return 'The post had no description to extract from.';
    default:
      return null;
  }
}

export const NO_VIDEO_NOTICE =
  "Video couldn't be downloaded — recipe extracted from the post description. Check it before saving.";
