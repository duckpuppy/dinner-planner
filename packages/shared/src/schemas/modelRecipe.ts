import { z } from 'zod';
import { importedRecipeSchema, type ImportedRecipe } from './index.js';

/**
 * Lenient normalisation of LLM-produced recipe JSON.
 *
 * Models routinely emit `null` for text fields, floats or 0 for times, unknown
 * `type` values, etc. The strict `importedRecipeSchema` is the contract for saved
 * data; this layer coerces model output into it so a harmless quirk (e.g.
 * `instructions: null`) is not mistaken for an unreadable response.
 */

const MAX_NAME = 200;
const MAX_UNIT = 50;
const MAX_NOTES = 500;

function toText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (Array.isArray(v)) {
    // Models sometimes return instructions as an array of steps.
    return v
      .map((x) => (typeof x === 'string' || typeof x === 'number' ? String(x).trim() : ''))
      .filter((s) => s !== '')
      .join('\n');
  }
  return '';
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toPositiveInt(v: unknown): number | null {
  const n = toNumber(v);
  if (n === null) return null;
  const r = Math.round(n);
  return r > 0 ? r : null;
}

function toNonNegative(v: unknown): number | null {
  const n = toNumber(v);
  return n !== null && n >= 0 ? n : null;
}

function toValidUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return z.string().url().safeParse(trimmed).success ? trimmed : null;
}

function toType(v: unknown): 'main' | 'side' | 'both' {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return s === 'side' || s === 'both' ? s : 'main';
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Strings at or above this length are never treated as placeholders. */
export const PLACEHOLDER_MAX_CHARS = 80;

const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /^(no|none|n\/a|unknown|unspecified)\b/i,
  /\b(no (detailed )?(instructions|steps|recipe|ingredients)|not (provided|specified|available|included|mentioned|listed))\b/i,
];

/**
 * True for short filler text a model writes when it has nothing to say ("No detailed
 * instructions provided in the text.", "N/A", "Not specified"). Only strings shorter than
 * PLACEHOLDER_MAX_CHARS qualify, so real instructions that merely mention these words survive.
 */
export function isPlaceholderText(s: string): boolean {
  const t = s.trim();
  if (t === '' || t.length >= PLACEHOLDER_MAX_CHARS) return false;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(t));
}

/** Trim, and blank out placeholder text. */
function toFreeText(v: unknown): string {
  const t = toText(v).trim();
  return isPlaceholderText(t) ? '' : t;
}

function normalizeIngredient(raw: unknown): ImportedRecipe['ingredients'][number] | null {
  if (!isRecord(raw)) return null;
  const name = toText(raw['name']).trim().slice(0, MAX_NAME);
  if (name === '') return null;
  const unit = toText(raw['unit']).trim().slice(0, MAX_UNIT);
  const notes = toFreeText(raw['notes']).slice(0, MAX_NOTES);
  const quantity = toNumber(raw['quantity']);
  const category = toText(raw['category']).trim();
  return {
    quantity: quantity !== null && quantity > 0 ? quantity : null,
    unit: unit === '' ? null : unit,
    name,
    notes: notes === '' ? null : notes,
    category: category === '' ? 'Other' : category,
    storeIds: [],
  };
}

/**
 * Coerce arbitrary parsed model output into an `ImportedRecipe`.
 * Returns null only when the output is not a JSON object at all.
 */
export function normalizeModelRecipe(raw: unknown): ImportedRecipe | null {
  if (!isRecord(raw)) return null;

  const ingredients = (Array.isArray(raw['ingredients']) ? raw['ingredients'] : [])
    .map(normalizeIngredient)
    .filter((i): i is NonNullable<typeof i> => i !== null);

  const tags = (Array.isArray(raw['tags']) ? raw['tags'] : [])
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter((t) => t !== '');

  const candidate = {
    name: toText(raw['name']).trim(),
    description: toFreeText(raw['description']),
    type: toType(raw['type']),
    ingredients,
    instructions: toFreeText(raw['instructions']),
    prepTime: toPositiveInt(raw['prepTime']),
    cookTime: toPositiveInt(raw['cookTime']),
    servings: toPositiveInt(raw['servings']),
    calories: toNonNegative(raw['calories']),
    proteinG: toNonNegative(raw['proteinG']),
    carbsG: toNonNegative(raw['carbsG']),
    fatG: toNonNegative(raw['fatG']),
    sourceUrl: toValidUrl(raw['sourceUrl']),
    videoUrl: toValidUrl(raw['videoUrl']),
    tags,
  };

  const result = importedRecipeSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

/** Zod wrapper around `normalizeModelRecipe`; fails only for non-object input. */
export const modelRecipeSchema = z.unknown().transform((val, ctx): ImportedRecipe => {
  const recipe = normalizeModelRecipe(val);
  if (!recipe) {
    ctx.addIssue({ code: 'custom', message: 'Model output is not a recipe object' });
    return z.NEVER;
  }
  return recipe;
});

/** Minimum non-space characters of instructions that count as a recipe on their own. */
export const MIN_USABLE_INSTRUCTION_CHARS = 40;

/**
 * A recipe is worth showing/saving when it has ingredients, or instructions with at least
 * MIN_USABLE_INSTRUCTION_CHARS non-space characters (placeholder text is already blanked by the
 * normaliser; very short fragments are not a recipe). The name is deliberately ignored: the
 * client falls back to the post title when it is blank.
 */
export function isUsableRecipe(r: Pick<ImportedRecipe, 'ingredients' | 'instructions'>): boolean {
  return (
    r.ingredients.length > 0 ||
    r.instructions.replace(/\s/g, '').length >= MIN_USABLE_INSTRUCTION_CHARS
  );
}

/** User-facing message when the model ran fine but the post contains no recipe. */
export const NO_RECIPE_MESSAGE = 'No recipe found in this post.';
