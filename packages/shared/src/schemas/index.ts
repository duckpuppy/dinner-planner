import { z } from 'zod';

// Auth schemas
export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

// User schemas
export const createUserSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  displayName: z.string().min(1, 'Display name is required').max(100),
  password: z.string().min(8, 'Password must be at least 8 characters'),
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
  mainDishId: z.string().uuid().nullable().default(null),
  sideDishIds: z.array(z.string().uuid()).default([]),
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
