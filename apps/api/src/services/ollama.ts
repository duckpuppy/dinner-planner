import {
  isUsableRecipe,
  normalizeModelRecipe,
  NO_RECIPE_MESSAGE,
  type ImportedRecipe,
} from '@dinner-planner/shared';
import { getOllamaKeepAlive, getOllamaNumCtx, getOllamaTemperature } from './ollamaConfig.js';

const SYSTEM_PROMPT = `You are a recipe extraction assistant. Extract a structured recipe from the following text.
Return a JSON object with these exact fields:
- name (string): the dish name
- description (string|null): one-sentence summary taken from the text, or null
- type (string): "main" or "side"
- ingredients (array): objects with quantity (number|null), unit (string|null), name (string), notes (string|null), category (string: Produce/Dairy/Meat/Pantry/Spices/Other)
- instructions (string|null): step-by-step cooking instructions, or null when the text contains none
- prepTime (number|null): minutes
- cookTime (number|null): minutes
- servings (number|null)
- calories, proteinG, carbsG, fatG (number|null)
- sourceUrl: null
- videoUrl: null
- tags (string[]): cuisine type, cooking method, etc.

Rules:
- Use only what the text actually says. Never invent ingredients, quantities or steps.
- instructions must be null when the text contains no cooking steps.
- Never write placeholder or apology text such as "not provided", "not specified", "N/A" or "No detailed instructions provided". Use null (or an empty ingredients array) instead.
- If the text contains no recipe (for example the recipe is only linked or promised elsewhere), return an empty ingredients array and null instructions.
- If any other field cannot be determined, use null.
Respond with ONLY the JSON object, no other text.`;

const nullable = (type: string) => ({ type: [type, 'null'] });

/**
 * JSON Schema passed as Ollama's `format` (constrained decoding). Deliberately mirrors the
 * LENIENT shape that normalizeModelRecipe accepts (nullable text/number fields), not the
 * strict importedRecipeSchema: the point is to guarantee parseable JSON of the right shape,
 * while a post with no recipe can still yield empty fields (-> not_usable) instead of
 * forcing the model to invent content. Only name/ingredients/instructions are required.
 */
export const RECIPE_FORMAT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: nullable('string'),
    type: { type: 'string', enum: ['main', 'side', 'both'] },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          quantity: nullable('number'),
          unit: nullable('string'),
          name: { type: 'string' },
          notes: nullable('string'),
          category: { type: 'string' },
        },
        required: ['name'],
      },
    },
    instructions: nullable('string'),
    prepTime: nullable('number'),
    cookTime: nullable('number'),
    servings: nullable('number'),
    calories: nullable('number'),
    proteinG: nullable('number'),
    carbsG: nullable('number'),
    fatG: nullable('number'),
    sourceUrl: nullable('string'),
    videoUrl: nullable('string'),
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['name', 'ingredients', 'instructions'],
} as const;

/** Set once an Ollama server rejects a schema in `format` (HTTP 400); sticks for the process. */
let schemaFormatUnsupported = false;

/** Test hook: forget that the server rejected schema formats. */
export function resetOllamaFormatCompat(): void {
  schemaFormatUnsupported = false;
}

const CHARS_PER_TOKEN = 3.5;
const INPUT_BUDGET_RATIO = 0.85;
const TRANSCRIPT_HEADER = 'Video transcript:';
const COMMENTS_HEADER = 'Video comments';
/** A trimmed section shorter than its header plus this is dropped outright. */
const MIN_USEFUL_SECTION_CHARS = 100;

export function estimateTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Fit `text` into ~85% of num_ctx (after the fixed prompt overhead). Trims the LAST sections
 * first: comments, then transcript, then the tail of the head (title + description). The title
 * and the start of the description are never cut first. Sections are blank-line separated;
 * when the known headers are absent the whole text is tail-truncated.
 */
export function fitTextToContext(
  text: string,
  numCtx: number,
  overheadChars = 0
): { text: string; trimmed: boolean; originalChars: number } {
  const originalChars = text.length;
  const budget = Math.max(
    0,
    Math.floor(numCtx * INPUT_BUDGET_RATIO * CHARS_PER_TOKEN) - overheadChars
  );
  if (text.length <= budget) return { text, trimmed: false, originalChars };

  const cStart = text.indexOf(`\n\n${COMMENTS_HEADER}`);
  let tStart = text.indexOf(`\n\n${TRANSCRIPT_HEADER}`);
  if (cStart >= 0 && tStart > cStart) tStart = -1;
  const headEnd = Math.min(tStart >= 0 ? tStart : text.length, cStart >= 0 ? cStart : text.length);

  let head = text.slice(0, headEnd);
  let transcript = tStart >= 0 ? text.slice(tStart, cStart >= 0 ? cStart : text.length) : '';
  let comments = cStart >= 0 ? text.slice(cStart) : '';

  const total = () => head.length + transcript.length + comments.length;
  const shrink = (section: string, header: string): string => {
    const target = section.length - (total() - budget);
    if (target < header.length + 2 + MIN_USEFUL_SECTION_CHARS) return '';
    return section.slice(0, target);
  };

  if (total() > budget && comments) comments = shrink(comments, COMMENTS_HEADER);
  if (total() > budget && transcript) transcript = shrink(transcript, TRANSCRIPT_HEADER);
  if (total() > budget) {
    head = head.slice(0, Math.max(0, budget - transcript.length - comments.length));
  }

  return { text: head + transcript + comments, trimmed: true, originalChars };
}

const nsToMs = (ns: unknown): number | null =>
  typeof ns === 'number' && Number.isFinite(ns) ? Math.round(ns / 1e6) : null;

interface GenerateStats {
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export interface GenerateReport {
  model: string;
  inputChars: number;
  attempt: number;
  numCtx: number;
  outcome: 'ok' | 'not_usable' | 'invalid';
  totalMs: number | null;
  loadMs: number | null;
  promptEvalCount: number | null;
  evalCount: number | null;
}

type StatsInfo = Omit<GenerateReport, 'totalMs' | 'loadMs' | 'promptEvalCount' | 'evalCount'>;

function logGenerateStats(
  stats: GenerateStats,
  info: StatsInfo,
  onReport?: (report: GenerateReport) => void
): void {
  onReport?.({
    ...info,
    totalMs: nsToMs(stats.total_duration),
    loadMs: nsToMs(stats.load_duration),
    promptEvalCount: stats.prompt_eval_count ?? null,
    evalCount: stats.eval_count ?? null,
  });
  console.info(
    `[ollama] generate model=${info.model} input_chars=${info.inputChars} ` +
      `total_ms=${nsToMs(stats.total_duration)} load_ms=${nsToMs(stats.load_duration)} ` +
      `prompt_eval_count=${stats.prompt_eval_count ?? null} eval_count=${stats.eval_count ?? null} ` +
      `num_ctx=${info.numCtx} attempt=${info.attempt} outcome=${info.outcome}`
  );
  if (typeof stats.prompt_eval_count === 'number' && stats.prompt_eval_count >= 0.9 * info.numCtx) {
    console.warn(
      `[ollama] prompt_eval_count=${stats.prompt_eval_count} is >= 90% of num_ctx=${info.numCtx}; ` +
        'input was probably truncated (raise OLLAMA_NUM_CTX)'
    );
  }
}

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
  model: string,
  attempt: number,
  onReport?: (report: GenerateReport) => void
): Promise<AttemptOutcome> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GENERATE_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const numCtx = getOllamaNumCtx();
    const preamble = `${SYSTEM_PROMPT}\n\nText to extract recipe from:\n`;
    const fitted = fitTextToContext(text, numCtx, preamble.length);
    if (fitted.trimmed) {
      console.warn(
        `[ollama] input trimmed to fit num_ctx=${numCtx}: ${fitted.originalChars} -> ${fitted.text.length} chars ` +
          `(~${estimateTokens(fitted.originalChars)} -> ~${estimateTokens(fitted.text.length + preamble.length)} tokens)`
      );
    }
    const prompt = `${preamble}${fitted.text}`;

    const post = (format: unknown) =>
      fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          format,
          stream: false,
          keep_alive: getOllamaKeepAlive(),
          options: { temperature: getOllamaTemperature(), num_ctx: numCtx },
        }),
        signal: controller.signal,
      });

    let response: Response;
    try {
      response = await post(schemaFormatUnsupported ? 'json' : RECIPE_FORMAT_SCHEMA);
      if (response.status === 400 && !schemaFormatUnsupported) {
        let rejected = '';
        try {
          rejected = await response.text();
        } catch {
          // ignore unreadable body
        }
        if (/format|schema/i.test(rejected)) {
          schemaFormatUnsupported = true;
          console.warn(
            '[ollama] server rejected a JSON Schema in `format`; falling back to format="json" for this process'
          );
          response = await post('json');
        } else {
          // Body already consumed; hand the generic error path an equivalent response.
          response = new Response(rejected, { status: 400, statusText: response.statusText });
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        console.warn(
          `[ollama] generate request timed out after ${Date.now() - startedAt}ms model=${model} attempt=${attempt}`
        );
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

    const body = (await response.json()) as GenerateStats & { response?: string };
    const statInfo = { model, inputChars: fitted.text.length, attempt, numCtx };
    const rawText = body.response;

    if (!rawText) {
      console.warn('[ollama] empty response field in generate result');
      return { kind: 'fatal', error: 'The AI model returned an empty response' };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch (err) {
      logGenerateStats(body, { ...statInfo, outcome: 'invalid' }, onReport);
      console.warn('[ollama] failed to parse response as JSON:', err);
      return { kind: 'retry', error: UNREADABLE_MESSAGE, invalid: true };
    }

    const recipe = normalizeModelRecipe(parsed);
    if (!recipe) {
      logGenerateStats(body, { ...statInfo, outcome: 'invalid' }, onReport);
      console.warn('[ollama] response was not a recipe object');
      return { kind: 'retry', error: UNREADABLE_MESSAGE, invalid: true };
    }

    if (!isUsableRecipe(recipe)) {
      logGenerateStats(body, { ...statInfo, outcome: 'not_usable' }, onReport);
      console.warn('[ollama] model returned a valid but empty recipe');
      return { kind: 'not_usable' };
    }

    logGenerateStats(body, { ...statInfo, outcome: 'ok' }, onReport);
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
  opts: { retryDelaysMs?: number[]; onReport?: (report: GenerateReport) => void } = {}
): Promise<ExtractionAttempt> {
  const delays = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  let lastError = 'Recipe extraction failed';
  let invalidSeen = false;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) {
      console.warn(`[ollama] retrying generate (attempt ${attempt + 1} of ${delays.length + 1})`);
      await sleep(delays[attempt - 1]);
    }
    const outcome = await generateOnce(text, ollamaUrl, model, attempt + 1, opts.onReport);
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
