import type { ImportedRecipe } from '@dinner-planner/shared';
import { importedRecipeSchema } from '@dinner-planner/shared';

const DEFAULT_TIMEOUT = 60_000; // 60 seconds

function buildExtractionPrompt(text: string): string {
  return `You are a recipe extraction assistant. Extract a structured recipe from the following text.
Return a JSON object with these exact fields:
- name (string): the dish name
- description (string): brief description
- type (string): either "main" or "side"
- ingredients (array of objects with: quantity (number or null), unit (string or null), name (string), notes (string or null), category (string, e.g. "Produce", "Dairy", "Meat", "Pantry", "Other"))
- instructions (string): step-by-step cooking instructions
- prepTime (number or null): preparation time in minutes
- cookTime (number or null): cooking time in minutes
- servings (number or null): number of servings
- calories (number or null): calories per serving
- proteinG (number or null): protein grams per serving
- carbsG (number or null): carbs grams per serving
- fatG (number or null): fat grams per serving
- sourceUrl (null)
- videoUrl (null)
- tags (array of strings): relevant tags like cuisine type, cooking method

If a field cannot be determined from the text, use null (for nullable fields) or reasonable defaults.

Text to extract from:
---
${text}
---`;
}

/**
 * Check if the Ollama instance at ollamaUrl is reachable.
 * Returns true if GET /api/tags responds with 200, false otherwise.
 */
export async function checkOllamaHealth(ollamaUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, { signal: controller.signal });
    return res.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send text to Ollama for recipe extraction.
 * Returns a validated ImportedRecipe or null on any failure.
 */
export async function extractRecipeFromText(
  text: string,
  ollamaUrl: string,
  model: string
): Promise<ImportedRecipe | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: buildExtractionPrompt(text),
        format: 'json',
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[ollama] generate request failed with status ${res.status}`);
      return null;
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      console.warn('[ollama] failed to parse JSON response from /api/generate:', err);
      return null;
    }

    if (
      !body ||
      typeof body !== 'object' ||
      typeof (body as Record<string, unknown>)['response'] !== 'string'
    ) {
      console.warn('[ollama] unexpected response shape from /api/generate:', body);
      return null;
    }

    const rawResponse = (body as Record<string, unknown>)['response'] as string;

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawResponse);
    } catch (err) {
      console.warn('[ollama] failed to parse recipe JSON from model response:', err);
      return null;
    }

    // Inject storeIds defaults for ingredients if missing (schema requires it)
    if (parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>;
      if (Array.isArray(p['ingredients'])) {
        p['ingredients'] = p['ingredients'].map((ing: unknown) => {
          if (ing && typeof ing === 'object') {
            const i = ing as Record<string, unknown>;
            if (!Array.isArray(i['storeIds'])) {
              return { ...i, storeIds: [] };
            }
          }
          return ing;
        });
      }
    }

    const result = importedRecipeSchema.safeParse(parsed);
    if (!result.success) {
      console.warn('[ollama] recipe validation failed:', result.error.flatten());
      return null;
    }

    return result.data;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn('[ollama] request timed out after', DEFAULT_TIMEOUT, 'ms');
    } else {
      console.warn('[ollama] request failed:', err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
