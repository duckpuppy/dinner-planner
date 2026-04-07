import { type ImportedRecipe } from '@dinner-planner/shared';
import { getSettings } from './settings.js';
import { extractRecipeFromText } from './ollama.js';

export interface ExtractionResult {
  recipe: ImportedRecipe | null;
  rawDescription: string;
  rawTitle: string;
  source: 'llm' | 'none';
}

export async function extractRecipeFromMetadata(
  metadata: Record<string, unknown>
): Promise<ExtractionResult> {
  const rawTitle = typeof metadata['title'] === 'string' ? metadata['title'] : '';
  const rawDescription = typeof metadata['description'] === 'string' ? metadata['description'] : '';

  const noneResult: ExtractionResult = {
    recipe: null,
    rawDescription,
    rawTitle,
    source: 'none',
  };

  const settings = await getSettings();
  const llmMode = settings.llmMode as string | null | undefined;

  if (!llmMode || llmMode === 'disabled') {
    return noneResult;
  }

  if (!rawDescription) {
    return noneResult;
  }

  if (llmMode === 'direct') {
    const ollamaUrl = settings.ollamaUrl as string | null | undefined;
    if (!ollamaUrl) {
      return noneResult;
    }

    const text = rawTitle ? `${rawTitle}\n\n${rawDescription}` : rawDescription;
    const model = (settings.ollamaModel as string | null | undefined) ?? 'gemma4-e4b';
    const recipe = await extractRecipeFromText(text, ollamaUrl, model);

    return {
      recipe,
      rawDescription,
      rawTitle,
      source: recipe ? 'llm' : 'none',
    };
  }

  // llmMode === 'n8n' — placeholder
  return noneResult;
}
