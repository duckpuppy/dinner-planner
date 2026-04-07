import { importedRecipeSchema, type ImportedRecipe } from '@dinner-planner/shared';

const SYSTEM_PROMPT = `You are a recipe extraction assistant. Extract a structured recipe from the following text.
Return a JSON object with these exact fields:
- name (string): the dish name
- description (string): brief description
- type (string): "main" or "side"
- ingredients (array): objects with quantity (number|null), unit (string|null), name (string), notes (string|null), category (string: Produce/Dairy/Meat/Pantry/Spices/Other)
- instructions (string): step-by-step instructions
- prepTime (number|null): minutes
- cookTime (number|null): minutes
- servings (number|null)
- calories, proteinG, carbsG, fatG (number|null)
- sourceUrl: null
- videoUrl: null
- tags (string[]): cuisine type, cooking method, etc.

If a field cannot be determined, use null or reasonable defaults.
Respond with ONLY the JSON object, no other text.`;

export async function checkOllamaHealth(ollamaUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${ollamaUrl}/api/tags`, { signal: controller.signal });
      return response.ok;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return false;
  }
}

export async function extractRecipeFromText(
  text: string,
  ollamaUrl: string,
  model: string
): Promise<ImportedRecipe | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const prompt = `${SYSTEM_PROMPT}\n\nText to extract recipe from:\n${text}`;

    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, format: 'json', stream: false }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn(`[ollama] generate request failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const body = (await response.json()) as { response?: string };
    const rawText = body.response;

    if (!rawText) {
      console.warn('[ollama] empty response field in generate result');
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      console.warn('[ollama] failed to parse response as JSON:', err);
      return null;
    }

    const result = importedRecipeSchema.safeParse(parsed);
    if (!result.success) {
      console.warn('[ollama] recipe validation failed:', result.error.issues);
      return null;
    }

    return result.data;
  } catch (err) {
    console.warn('[ollama] extractRecipeFromText error:', err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
