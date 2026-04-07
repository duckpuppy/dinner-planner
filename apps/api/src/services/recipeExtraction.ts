import { getSettings } from './settings.js';
import { extractRecipeFromText } from './ollama.js';
import type { ImportedRecipe } from '@dinner-planner/shared';

export interface ExtractionResult {
  recipe: ImportedRecipe | null;
  rawDescription: string;
  rawTitle: string;
  source: 'llm' | 'none';
}

/**
 * Dispatch recipe extraction based on the current llmMode setting.
 * Accepts video/page metadata and returns a structured recipe if extraction succeeds.
 */
export async function extractRecipeFromMetadata(
  metadata: Record<string, unknown>
): Promise<ExtractionResult> {
  const rawDescription = (metadata['description'] as string) || '';
  const rawTitle = (metadata['title'] as string) || '';

  const settings = await getSettings();

  if (settings.llmMode === 'disabled' || !rawDescription) {
    return { recipe: null, rawDescription, rawTitle, source: 'none' };
  }

  if (settings.llmMode === 'direct') {
    if (!settings.ollamaUrl) {
      return { recipe: null, rawDescription, rawTitle, source: 'none' };
    }
    const recipe = await extractRecipeFromText(
      `Title: ${rawTitle}\n\n${rawDescription}`,
      settings.ollamaUrl,
      settings.ollamaModel ?? 'gemma4-e4b'
    );
    return { recipe, rawDescription, rawTitle, source: recipe ? 'llm' : 'none' };
  }

  if (settings.llmMode === 'n8n') {
    // Placeholder for n8n integration — Phase 3 only implements direct mode
    // For now, fall through to 'none'
    return { recipe: null, rawDescription, rawTitle, source: 'none' };
  }

  return { recipe: null, rawDescription, rawTitle, source: 'none' };
}
