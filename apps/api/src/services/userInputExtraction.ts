import { extractCandidateUrls, resolveLinkedRecipe, type LinkStage } from './linkedRecipe.js';
import { assertHostnameAllowed } from './safeFetch.js';

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
