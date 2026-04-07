import { z } from 'zod';

// Auth schemas
export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required').max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(128),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

// User schemas
export const createUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  displayName: z.string().min(1, 'Display name is required').max(100),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(['admin', 'member']),
});

export const updateUserSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  role: z.enum(['admin', 'member']).optional(),
});

// Dietary tags (M18)
export const DIETARY_TAGS = [
  'vegetarian',
  'vegan',
  'gluten_free',
  'dairy_free',
  'nut_free',
  'low_carb',
  'low_calorie',
] as const;
export const dietaryTagSchema = z.enum(DIETARY_TAGS);
export type DietaryTag = z.infer<typeof dietaryTagSchema>;

export const userPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark']).optional(),
  homeView: z.enum(['today', 'week']).optional(),
  dietaryPreferences: z.array(dietaryTagSchema).optional(),
});

// Ingredient schema
export const ingredientSchema = z.object({
  quantity: z.number().positive().nullable(),
  unit: z.string().max(50).nullable(),
  name: z.string().min(1, 'Ingredient name is required').max(200),
  notes: z.string().max(500).nullable(),
  category: z.string().default('Other'),
  storeIds: z.array(z.string()).default([]),
});

// Dish schemas
export const createDishSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(2000).default(''),
  type: z.enum(['main', 'side']),
  ingredients: z.array(ingredientSchema).default([]),
  instructions: z.string().max(10000).default(''),
  prepTime: z.number().int().positive().nullable().default(null),
  cookTime: z.number().int().positive().nullable().default(null),
  servings: z.number().int().positive().nullable().default(null),
  calories: z.number().nonnegative().nullable().default(null),
  proteinG: z.number().nonnegative().nullable().default(null),
  carbsG: z.number().nonnegative().nullable().default(null),
  fatG: z.number().nonnegative().nullable().default(null),
  sourceUrl: z.string().url().nullable().default(null),
  videoUrl: z.string().url().nullable().default(null),
  tags: z.array(z.string().max(50)).default([]),
  dietaryTags: z.array(dietaryTagSchema).default([]),
});

export const updateDishSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200).optional(),
  description: z.string().max(2000).optional(),
  type: z.enum(['main', 'side']).optional(),
  ingredients: z.array(ingredientSchema).optional(),
  instructions: z.string().max(10000).optional(),
  prepTime: z.number().int().positive().nullable().optional(),
  cookTime: z.number().int().positive().nullable().optional(),
  servings: z.number().int().positive().nullable().optional(),
  calories: z.number().nonnegative().nullable().optional(),
  proteinG: z.number().nonnegative().nullable().optional(),
  carbsG: z.number().nonnegative().nullable().optional(),
  fatG: z.number().nonnegative().nullable().optional(),
  sourceUrl: z.string().url().nullable().optional(),
  videoUrl: z.string().url().nullable().optional(),
  tags: z.array(z.string().max(50)).optional(),
  dietaryTags: z.array(dietaryTagSchema).optional(),
});

// Dinner entry schemas
export const updateDinnerEntrySchema = z.object({
  type: z.enum(['assembled', 'fend_for_self', 'dining_out', 'custom', 'leftovers']),
  customText: z.string().max(500).nullable().default(null),
  restaurantName: z.string().max(200).nullable().default(null),
  restaurantNotes: z.string().max(500).nullable().default(null),
  mainDishId: z.string().uuid().nullable().default(null),
  sideDishIds: z.array(z.string().uuid()).default([]),
  sourceEntryId: z.string().uuid().nullable().optional(),
  scale: z.number().int().min(1).max(4).default(1),
});

// Recurring pattern schemas
export const createPatternSchema = z.object({
  label: z.string().min(1, 'Label is required').max(100),
  dayOfWeek: z.number().int().min(0).max(6),
  type: z.enum(['assembled', 'fend_for_self', 'dining_out', 'custom']),
  mainDishId: z.string().uuid().nullable().default(null),
  sideDishIds: z.array(z.string().uuid()).default([]),
  customText: z.string().max(500).nullable().default(null),
});

export const updatePatternSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  type: z.enum(['assembled', 'fend_for_self', 'dining_out', 'custom']).optional(),
  mainDishId: z.string().uuid().nullable().optional(),
  sideDishIds: z.array(z.string().uuid()).optional(),
  customText: z.string().max(500).nullable().optional(),
});

// Preparation schemas
export const createPreparationSchema = z.object({
  dinnerEntryId: z.string().uuid(),
  dishId: z.string().uuid(),
  preparerIds: z.array(z.string().uuid()).min(1),
  notes: z.string().max(2000).nullable().default(null),
});

export const updatePreparationSchema = z.object({
  notes: z.string().max(2000).nullable(),
});

// Rating schemas
export const createRatingSchema = z.object({
  stars: z.number().int().min(1).max(5),
  note: z.string().max(1000).nullable().default(null),
});

export const updateRatingSchema = z.object({
  stars: z.number().int().min(1).max(5).optional(),
  note: z.string().max(1000).nullable().optional(),
});

// Settings schemas
export const llmModeSchema = z.enum(['disabled', 'direct', 'n8n']);

export const updateSettingsSchema = z.object({
  weekStartDay: z.number().int().min(0).max(6).optional(),
  recencyWindowDays: z.number().int().min(1).max(365).optional(),
  ollamaUrl: z.string().url().nullable().optional(),
  ollamaModel: z.string().min(1).max(100).optional(),
  llmMode: llmModeSchema.optional(),
  n8nWebhookUrl: z.string().url().nullable().optional(),
  videoStorageLimitMb: z.number().int().min(100).max(102400).optional(),
});

// Suggestion schemas
export const suggestionsQuerySchema = z.object({
  tag: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
  exclude: z.preprocess((v) => (typeof v === 'string' ? [v] : v), z.array(z.string())).default([]),
  dietaryTags: z
    .preprocess((v) => (typeof v === 'string' ? [v] : v), z.array(dietaryTagSchema))
    .default([]),
});

export const suggestedDishSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['main', 'side']),
  description: z.string(),
  tags: z.array(z.string()),
  avgRating: z.number().nullable(),
  totalRatings: z.number(),
  lastPreparedDate: z.string().nullable(),
  score: z.number(),
  reasons: z.array(z.string()),
});

export const suggestionsResponseSchema = z.object({
  suggestions: z.array(suggestedDishSchema),
});

// Query parameter schemas
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const dishQuerySchema = paginationSchema.extend({
  type: z.enum(['main', 'side']).optional(),
  tag: z.string().optional(),
  archived: z
    .preprocess((v) => (typeof v === 'string' ? v === 'true' : v), z.boolean())
    .default(false),
  search: z.string().optional(),
  sort: z.enum(['name', 'rating', 'recent', 'created']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
  dietaryTags: z
    .preprocess((v) => (typeof v === 'string' ? [v] : v), z.array(dietaryTagSchema))
    .default([]),
});

export const dateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
});

export const groceryItemSchema = z.object({
  name: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  dishes: z.array(z.string()),
  notes: z.array(z.string()),
  inPantry: z.boolean().default(false),
  category: z.string().default('Other'),
  stores: z.array(z.string()).default([]),
});

export const groceriesResponseSchema = z.object({
  groceries: z.array(groceryItemSchema),
  weekStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
});

// Recipe import schemas
export const importRecipeUrlSchema = z.object({
  url: z.string().url('Must be a valid URL'),
});

export const importedRecipeSchema = z.object({
  name: z.string(),
  description: z.string(),
  type: z.enum(['main', 'side']),
  ingredients: z.array(ingredientSchema),
  instructions: z.string(),
  prepTime: z.number().int().positive().nullable(),
  cookTime: z.number().int().positive().nullable(),
  servings: z.number().int().positive().nullable(),
  calories: z.number().nonnegative().nullable(),
  proteinG: z.number().nonnegative().nullable(),
  carbsG: z.number().nonnegative().nullable(),
  fatG: z.number().nonnegative().nullable(),
  sourceUrl: z.string().url().nullable(),
  videoUrl: z.string().url().nullable(),
  tags: z.array(z.string()),
});

// Video import schemas
export const importVideoUrlSchema = z.object({
  url: z.string().url('Must be a valid URL'),
});

export const videoJobStatusSchema = z.enum(['pending', 'downloading', 'extracting', 'complete', 'failed']);

export const videoJobSchema = z.object({
  id: z.string(),
  dishId: z.string().nullable(),
  sourceUrl: z.string().url(),
  status: videoJobStatusSchema,
  progress: z.number().int().min(0).max(100),
  resultVideoFilename: z.string().nullable(),
  resultMetadata: z.record(z.unknown()).nullable(),
  extractedRecipe: importedRecipeSchema.nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Pantry schemas (M16: pantry tracking)
const pantryDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)')
  .nullable()
  .optional();

export const createPantryItemSchema = z.object({
  ingredientName: z.string().min(1).max(200),
  quantity: z.number().positive().nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  expiresAt: pantryDateSchema,
});

export const updatePantryItemSchema = z.object({
  ingredientName: z.string().min(1).max(200).optional(),
  quantity: z.number().positive().nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  expiresAt: pantryDateSchema,
});

export type PantryItem = {
  id: string;
  ingredientName: string;
  quantity: number | null;
  unit: string | null;
  expiresAt: string | null;
  createdAt: string;
};

// Dish note schemas (M14: recipe notes & cook log)
export const createDishNoteSchema = z.object({
  note: z.string().min(1).max(2000),
});

export const dishNoteSchema = z.object({
  id: z.string(),
  dishId: z.string(),
  note: z.string(),
  createdById: z.string().nullable(),
  createdByUsername: z.string().nullable(),
  createdAt: z.string(),
});

// Prep task schemas (M13: prep scheduling)
export const createPrepTaskSchema = z.object({
  description: z.string().min(1).max(500),
});

export const updatePrepTaskSchema = z.object({
  description: z.string().min(1).max(500).optional(),
  completed: z.boolean().optional(),
});

export const prepTaskSchema = z.object({
  id: z.string(),
  entryId: z.string(),
  description: z.string(),
  completed: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Store type (M25)
export type Store = {
  id: string;
  name: string;
  createdAt: string;
};

// Export inferred types from schemas
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>;
export type IngredientInput = z.infer<typeof ingredientSchema>;
export type CreateDishInput = z.infer<typeof createDishSchema>;
export type UpdateDishInput = z.infer<typeof updateDishSchema>;
export type UpdateDinnerEntryInput = z.infer<typeof updateDinnerEntrySchema>;
export type CreatePreparationInput = z.infer<typeof createPreparationSchema>;
export type UpdatePreparationInput = z.infer<typeof updatePreparationSchema>;
export type CreateRatingInput = z.infer<typeof createRatingSchema>;
export type UpdateRatingInput = z.infer<typeof updateRatingSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type DishQueryInput = z.infer<typeof dishQuerySchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
export type SuggestionsQueryInput = z.infer<typeof suggestionsQuerySchema>;
export type SuggestedDish = z.infer<typeof suggestedDishSchema>;
export type SuggestionsResponse = z.infer<typeof suggestionsResponseSchema>;
export type GroceryItem = z.infer<typeof groceryItemSchema>;
export type GroceriesResponse = z.infer<typeof groceriesResponseSchema>;
export type ImportRecipeUrlInput = z.infer<typeof importRecipeUrlSchema>;
export type ImportedRecipe = z.infer<typeof importedRecipeSchema>;
export type CreatePatternInput = z.infer<typeof createPatternSchema>;
export type UpdatePatternInput = z.infer<typeof updatePatternSchema>;
export type CreatePrepTaskInput = z.infer<typeof createPrepTaskSchema>;
export type UpdatePrepTaskInput = z.infer<typeof updatePrepTaskSchema>;
export type PrepTask = z.infer<typeof prepTaskSchema>;
export type CreateDishNoteInput = z.infer<typeof createDishNoteSchema>;
export type DishNote = z.infer<typeof dishNoteSchema>;
export type CreatePantryItemInput = z.infer<typeof createPantryItemSchema>;
export type UpdatePantryItemInput = z.infer<typeof updatePantryItemSchema>;
export type ImportVideoUrlInput = z.infer<typeof importVideoUrlSchema>;
export type VideoJobStatus = z.infer<typeof videoJobStatusSchema>;
export type VideoJob = z.infer<typeof videoJobSchema>;
export type LlmMode = z.infer<typeof llmModeSchema>;
