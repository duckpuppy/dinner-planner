import {
  extractCandidateUrls,
  followLinks,
  resolveLinkedRecipe,
  type LinkStage,
} from './linkedRecipe.js';
import { selectComments } from './recipeExtraction.js';
import { assertHostnameAllowed } from './safeFetch.js';
import { isVideoCommentsEnabled } from './videoImportConfig.js';

/** What the user supplied in the import review step (persisted on the job). */
export interface UserInput {
  extraText?: string;
  recipeUrl?: string;
}

export const LINKED_PAGE_NO_RECIPE_MESSAGE =
  'That page has no recipe data we can read. Paste the recipe text instead.';
export const LINK_UNUSABLE_MESSAGE = "That link can't be used.";
export const LINK_BLOCKED_MESSAGE =
  'That site blocked our automated request. Open the page and paste the recipe text here instead.';
export const LINK_UNREADABLE_MESSAGE =
  "We couldn't load that page. Check the link, or paste the recipe text instead.";

export interface PastedLinkFailure {
  status: 'no_recipe' | 'failed';
  error: string;
}

export type PastedLinkResult = { ok: true; stage: LinkStage } | ({ ok: false } & PastedLinkFailure);

/**
 * Resolve a link the user pasted through the same resolver as auto-discovered links
 * (JSON-LD recipe, then readable page text). Obviously unusable links (unparseable,
 * social-media hosts, private/loopback hosts) are rejected up front. Never throws.
 */
export async function resolvePastedLink(
  recipeUrl: string,
  postUrl: string
): Promise<PastedLinkResult> {
  const unusable: PastedLinkResult = {
    ok: false,
    status: 'failed',
    error: LINK_UNUSABLE_MESSAGE,
  };
  const [candidate] = extractCandidateUrls([recipeUrl], postUrl);
  if (!candidate) return unusable;
  try {
    assertHostnameAllowed(new URL(candidate).hostname.toLowerCase());
  } catch {
    return unusable;
  }
  const r = await resolveLinkedRecipe([candidate], { postUrl });
  return {
    ok: true,
    stage: {
      ...r,
      linkedPage:
        r.pageText && r.pageHost && !r.recipe ? { host: r.pageHost, text: r.pageText } : null,
    },
  };
}

/** Pasted text (URLs removed, whitespace collapsed) at least this long is worth sending to the model. */
export const PASTED_TEXT_MIN_CHARS = 200;

/** Length of the pasted text once URLs are stripped and whitespace collapsed. */
export function pastedTextLength(extraText: string): number {
  return extraText
    .replace(/(?:https?:\/\/|www\.)\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

/**
 * Link stage when the user pasted free text (dinner-22c.11). Links inside the pasted text
 * are resolved FIRST, then links from the post's caption/transcript/comments, sharing the
 * one MAX_CANDIDATES cap (extractCandidateUrls de-duplicates and keeps text order).
 * Without a usable link in the pasted text this is exactly `followLinks`.
 * `blocked` is true when the user's own (first) link was blocked, nothing else was usable
 * AND the pasted text is short (< PASTED_TEXT_MIN_CHARS once URLs are removed); substantial
 * pasted text falls through to the model instead. Never throws.
 */
export async function followLinksWithPastedText(
  postUrl: string,
  infoJson: Record<string, unknown>,
  transcript: string | null,
  extraText: string
): Promise<{ stage: LinkStage; blocked: boolean }> {
  if (extractCandidateUrls([extraText], postUrl).length === 0) {
    return { stage: await followLinks(postUrl, infoJson, transcript), blocked: false };
  }
  try {
    const description = typeof infoJson['description'] === 'string' ? infoJson['description'] : '';
    const comments = isVideoCommentsEnabled() ? selectComments(infoJson, 20_000) : null;
    const candidates = extractCandidateUrls(
      [extraText, description, transcript ?? '', comments ?? ''],
      postUrl
    );
    const r = await resolveLinkedRecipe(candidates, { postUrl });
    const stage: LinkStage = {
      ...r,
      linkedPage:
        r.pageText && r.pageHost && !r.recipe ? { host: r.pageHost, text: r.pageText } : null,
    };
    return {
      stage,
      blocked:
        !stage.recipe &&
        !stage.linkedPage &&
        stage.outcomes[0]?.result === 'blocked' &&
        pastedTextLength(extraText) < PASTED_TEXT_MIN_CHARS,
    };
  } catch {
    const stage = { recipe: null, pageText: null, pageHost: null, outcomes: [], linkedPage: null };
    return { stage, blocked: false };
  }
}

/** Friendly failure for a pasted link that yielded neither a recipe nor usable page text. */
export function pastedLinkFailure(stage: LinkStage): PastedLinkFailure | null {
  if (stage.recipe || stage.linkedPage) return null;
  switch (stage.outcomes[0]?.result) {
    case 'blocked':
      return { status: 'failed', error: LINK_BLOCKED_MESSAGE };
    case 'no_recipe':
      return { status: 'no_recipe', error: LINKED_PAGE_NO_RECIPE_MESSAGE };
    default:
      return { status: 'failed', error: LINK_UNREADABLE_MESSAGE };
  }
}

/** Parse the persisted userInput object defensively. */
export function parseUserInput(raw: unknown): UserInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const extraText = typeof o.extraText === 'string' && o.extraText.trim() ? o.extraText : undefined;
  const recipeUrl = typeof o.recipeUrl === 'string' && o.recipeUrl.trim() ? o.recipeUrl : undefined;
  if (!extraText && !recipeUrl) return null;
  return { extraText, recipeUrl };
}
