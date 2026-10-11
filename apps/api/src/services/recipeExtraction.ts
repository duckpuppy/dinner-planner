import { type ImportedRecipe } from '@dinner-planner/shared';
import { getSettings } from './settings.js';
import { extractRecipeFromTextDetailed } from './ollama.js';
import { isVideoCommentsEnabled } from './videoImportConfig.js';

export type ExtractionStatus = 'llm' | 'failed' | 'disabled' | 'no_description';

export interface ExtractionResult {
  recipe: ImportedRecipe | null;
  rawDescription: string;
  rawTitle: string;
  source: 'llm' | 'none';
  /** Why the recipe is (or isn't) present */
  status: ExtractionStatus;
  /** Friendly reason when status is 'failed' */
  error: string | null;
}

const MAX_TRANSCRIPT_LENGTH = 8000;
const MAX_COMMENTS_LENGTH = 8000;
const MAX_TOP_COMMENTS = 10;

interface RawComment {
  author?: unknown;
  text?: unknown;
  like_count?: unknown;
  author_is_uploader?: unknown;
}

/**
 * Pick comments worth feeding to the LLM: the uploader's own comments first
 * (they often hold the recipe), then the most-liked, capped at MAX_COMMENTS_LENGTH chars.
 * Returns null when there is nothing usable.
 */
export function selectComments(
  metadata: Record<string, unknown>,
  maxChars = MAX_COMMENTS_LENGTH
): string | null {
  const raw = metadata['comments'];
  if (!Array.isArray(raw)) return null;

  const comments = (raw as RawComment[]).filter(
    (c): c is RawComment & { text: string } => typeof c?.text === 'string' && c.text.trim() !== ''
  );
  if (comments.length === 0) return null;

  const uploaderName = typeof metadata['uploader'] === 'string' ? metadata['uploader'] : null;
  const isUploader = (c: RawComment) =>
    c.author_is_uploader === true || (uploaderName !== null && c.author === uploaderName);
  const likes = (c: RawComment) => (typeof c.like_count === 'number' ? c.like_count : 0);

  const uploader = comments.filter(isUploader);
  const others = comments
    .filter((c) => !isUploader(c))
    .sort((a, b) => likes(b) - likes(a))
    .slice(0, MAX_TOP_COMMENTS);

  const text = [...uploader, ...others].map((c) => c.text.trim()).join('\n---\n');
  return text.length > maxChars ? text.slice(0, maxChars) + '...' : text;
}

export async function extractRecipeFromMetadata(
  metadata: Record<string, unknown>,
  transcript?: string | null
): Promise<ExtractionResult> {
  const rawTitle = typeof metadata['title'] === 'string' ? metadata['title'] : '';
  const rawDescription = typeof metadata['description'] === 'string' ? metadata['description'] : '';

  const noneResult = (status: ExtractionStatus, error: string | null = null): ExtractionResult => ({
    recipe: null,
    rawDescription,
    rawTitle,
    source: 'none',
    status,
    error,
  });

  const settings = await getSettings();
  const llmMode = settings.llmMode as string | null | undefined;

  if (!llmMode || llmMode === 'disabled') {
    return noneResult('disabled');
  }

  if (!rawDescription) {
    return noneResult('no_description');
  }

  if (llmMode === 'direct') {
    const ollamaUrl = settings.ollamaUrl as string | null | undefined;
    if (!ollamaUrl) {
      return noneResult('disabled');
    }

    let text = rawTitle ? `${rawTitle}\n\n${rawDescription}` : rawDescription;

    if (transcript && transcript.length > 0) {
      // Truncate very long transcripts to avoid overwhelming the LLM context
      const truncated =
        transcript.length > MAX_TRANSCRIPT_LENGTH
          ? transcript.slice(0, MAX_TRANSCRIPT_LENGTH) + '...'
          : transcript;
      text += `\n\nVideo transcript:\n${truncated}`;
    }

    if (isVideoCommentsEnabled()) {
      const comments = selectComments(metadata);
      if (comments) {
        text += `\n\nVideo comments (the uploader's own comments first):\n${comments}`;
      }
    }

    const model = (settings.ollamaModel as string | null | undefined) ?? 'gemma4-e4b';
    const { recipe, error } = await extractRecipeFromTextDetailed(text, ollamaUrl, model);

    if (!recipe) {
      return noneResult('failed', error ?? 'Recipe extraction failed');
    }

    return {
      recipe,
      rawDescription,
      rawTitle,
      source: 'llm',
      status: 'llm',
      error: null,
    };
  }

  // llmMode === 'n8n' — placeholder
  return noneResult('disabled');
}
