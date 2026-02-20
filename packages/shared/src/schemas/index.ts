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

export const userPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark']).optional(),
  homeView: z.enum(['today', 'week']).optional(),
});

// Ingredient schema
export const ingredientSchema = z.object({
  quantity: z.number().positive().nullable(),
  unit: z.string().max(50).nullable(),
  name: z.string().min(1, 'Ingredient name is required').max(200),
  notes: z.string().max(500).nullable(),
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
  sourceUrl: z.string().url().nullable().default(null),
  videoUrl: z.string().url().nullable().default(null),
  tags: z.array(z.string().max(50)).default([]),
});

export const updateDishSchema = createDishSchema.partial();

// Dinner entry schemas
export const updateDinnerEntrySchema = z.object({
  type: z.enum(['assembled', 'fend_for_self', 'dining_out', 'custom']),
  customText: z.string().max(500).nullable().default(null),
  restaurantName: z.string().max(200).nullable().default(null),
  restaurantNotes: z.string().max(500).nullable().default(null),
  mainDishId: z.string().uuid().nullable().default(null),
  sideDishIds: z.array(z.string().uuid()).default([]),
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
  preparedById: z.string().uuid(),
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

export const updateRatingSchema = createRatingSchema.partial();

// Settings schemas
export const updateSettingsSchema = z.object({
  weekStartDay: z.number().int().min(0).max(6).optional(),
  recencyWindowDays: z.number().int().min(1).max(365).optional(),
});

// Suggestion schemas
export const suggestionsQuerySchema = z.object({
  tag: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
  exclude: z.preprocess((v) => (typeof v === 'string' ? [v] : v), z.array(z.string())).default([]),
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
  sourceUrl: z.string().url().nullable(),
  videoUrl: z.string().url().nullable(),
  tags: z.array(z.string()),
});

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
