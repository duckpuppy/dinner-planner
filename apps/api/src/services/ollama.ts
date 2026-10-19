import {
  isUsableRecipe,
  normalizeModelRecipe,
  NO_RECIPE_MESSAGE,
  type ImportedRecipe,
} from '@dinner-planner/shared';

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

export async function checkOllamaHealth(
  ollamaUrl: string
): Promise<{ available: boolean; models: string[] }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${ollamaUrl}/api/tags`, { signal: controller.signal });
      if (!response.ok) return { available: false, models: [] };
      const body = (await response.json()) as { models?: { name: string }[] };
      const models = (body.models ?? []).map((m) => m.name);
      return { available: true, models };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return { available: false, models: [] };
  }
}

const GENERATE_TIMEOUT_MS = 60000;
const MAX_LOGGED_BODY_CHARS = 500;

/** Backoff before the 2nd and 3rd attempts (so up to 2 retries). */
export const DEFAULT_RETRY_DELAYS_MS = [3000, 10000];

export interface ExtractionAttempt {
  recipe: ImportedRecipe | null;
  /** Friendly, user-facing reason when recipe is null */
  error: string | null;
  /**
   * True when the model ran and returned a valid response that contained no usable
   * recipe (e.g. the post simply has none). Not an error and not retried.
   */
  notUsable?: boolean;
}

const UNREADABLE_MESSAGE = "The AI model's response couldn't be read as a recipe";

type AttemptOutcome =
  | { kind: 'ok'; recipe: ImportedRecipe }
  | { kind: 'not_usable' }
  /** `invalid`: malformed output (not JSON / not an object); retried once, then fatal. */
  | { kind: 'retry'; error: string; invalid?: boolean }
  | { kind: 'fatal'; error: string };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function generateOnce(
  text: string,
  ollamaUrl: string,
  model: string
): Promise<AttemptOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);

  try {
    const prompt = `${SYSTEM_PROMPT}\n\nText to extract recipe from:\n${text}`;

    let response: Response;
    try {
      response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, format: 'json', stream: false }),
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        console.warn('[ollama] generate request timed out');
        return { kind: 'fatal', error: 'The AI model took too long to respond' };
      }
      console.warn('[ollama] generate request network error:', err);
      return { kind: 'retry', error: "Couldn't reach the AI model" };
    }

    if (!response.ok) {
      let bodyText = '';
      try {
        bodyText = (await response.text()).slice(0, MAX_LOGGED_BODY_CHARS);
      } catch {
        // ignore unreadable body
      }
      console.warn(
        `[ollama] generate request failed: ${response.status} ${response.statusText} body=${bodyText}`
      );
      const error = `The AI model returned an error (HTTP ${response.status})`;
      return response.status >= 500 ? { kind: 'retry', error } : { kind: 'fatal', error };
    }

    const body = (await response.json()) as { response?: string };
    const rawText = body.response;

    if (!rawText) {
      console.warn('[ollama] empty response field in generate result');
      return { kind: 'fatal', error: 'The AI model returned an empty response' };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      console.warn('[ollama] failed to parse response as JSON:', err);
      return { kind: 'retry', error: UNREADABLE_MESSAGE, invalid: true };
    }

    const recipe = normalizeModelRecipe(parsed);
    if (!recipe) {
      console.warn('[ollama] response was not a recipe object');
      return { kind: 'retry', error: UNREADABLE_MESSAGE, invalid: true };
    }

    if (!isUsableRecipe(recipe)) {
      console.warn('[ollama] model returned a valid but empty recipe');
      return { kind: 'not_usable' };
    }

    return { kind: 'ok', recipe };
  } catch (err) {
    console.warn('[ollama] extractRecipeFromText error:', err);
    return {
      kind: 'fatal',
      error: controller.signal.aborted
        ? 'The AI model took too long to respond'
        : 'Recipe extraction failed unexpectedly',
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Call Ollama /api/generate. Retries on 5xx and network errors (not 4xx, not timeouts)
 * with backoff between attempts, and once on malformed (non-JSON) output. A valid but
 * empty recipe is not retried; it is reported via `notUsable`. Returns the recipe or a friendly error.
 */
export async function extractRecipeFromTextDetailed(
  text: string,
  ollamaUrl: string,
  model: string,
  opts: { retryDelaysMs?: number[] } = {}
): Promise<ExtractionAttempt> {
  const delays = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  let lastError = 'Recipe extraction failed';
  let invalidSeen = false;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) {
      console.warn(`[ollama] retrying generate (attempt ${attempt + 1} of ${delays.length + 1})`);
      await sleep(delays[attempt - 1]);
    }
    const outcome = await generateOnce(text, ollamaUrl, model);
    if (outcome.kind === 'ok') return { recipe: outcome.recipe, error: null };
    if (outcome.kind === 'not_usable') {
      return { recipe: null, error: NO_RECIPE_MESSAGE, notUsable: true };
    }
    lastError = outcome.error;
    if (outcome.kind === 'fatal') break;
    if (outcome.invalid) {
      // Malformed output gets exactly one retry regardless of the backoff budget.
      if (invalidSeen) break;
      invalidSeen = true;
    }
  }

  return { recipe: null, error: lastError };
}

export async function extractRecipeFromText(
  text: string,
  ollamaUrl: string,
  model: string
): Promise<ImportedRecipe | null> {
  return (await extractRecipeFromTextDetailed(text, ollamaUrl, model)).recipe;
}
