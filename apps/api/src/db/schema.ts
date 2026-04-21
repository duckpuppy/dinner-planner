import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const DIETARY_TAGS = [
  'vegetarian',
  'vegan',
  'gluten_free',
  'dairy_free',
  'nut_free',
  'low_carb',
] as const;
export type DietaryTag = (typeof DIETARY_TAGS)[number];

// Helper for timestamps
const timestamps = {
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
};

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'member'] })
    .notNull()
    .default('member'),
  theme: text('theme', { enum: ['light', 'dark'] })
    .notNull()
    .default('light'),
  homeView: text('home_view', { enum: ['today', 'week'] })
    .notNull()
    .default('today'),
  dietaryPreferences: text('dietary_preferences').notNull().default('[]'),
  ...timestamps,
});

// Dishes table
export const dishes = sqliteTable('dishes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  type: text('type', { enum: ['main', 'side', 'both'] }).notNull(),
  instructions: text('instructions').notNull().default(''),
  prepTime: integer('prep_time'),
  cookTime: integer('cook_time'),
  servings: integer('servings'),
  calories: real('calories'),
  proteinG: real('protein_g'),
  carbsG: real('carbs_g'),
  fatG: real('fat_g'),
  sourceUrl: text('source_url'),
  videoUrl: text('video_url'),
  localVideoFilename: text('local_video_filename'),
  videoThumbnailFilename: text('video_thumbnail_filename'),
  videoSize: integer('video_size'),
  videoDuration: integer('video_duration'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdById: text('created_by_id')
    .notNull()
    .references(() => users.id),
  ...timestamps,
});

// Ingredients table (structured)
export const ingredients = sqliteTable('ingredients', {
  id: text('id').primaryKey(),
  dishId: text('dish_id')
    .notNull()
    .references(() => dishes.id, { onDelete: 'cascade' }),
  quantity: real('quantity'),
  unit: text('unit'),
  name: text('name').notNull(),
  notes: text('notes'),
  sortOrder: integer('sort_order').notNull().default(0),
  category: text('category').notNull().default('Other'),
});

// Tags table
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
});

// Dish tags junction table
export const dishTags = sqliteTable('dish_tags', {
  dishId: text('dish_id')
    .notNull()
    .references(() => dishes.id, { onDelete: 'cascade' }),
  tagId: text('tag_id')
    .notNull()
    .references(() => tags.id, { onDelete: 'cascade' }),
});

// Dish dietary tags table (M18: dietary restrictions)
export const dishDietaryTags = sqliteTable(
  'dish_dietary_tags',
  {
    dishId: text('dish_id')
      .notNull()
      .references(() => dishes.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (table) => [primaryKey({ columns: [table.dishId, table.tag] })]
);

// Weekly menus table
export const weeklyMenus = sqliteTable('weekly_menus', {
  id: text('id').primaryKey(),
  weekStartDate: text('week_start_date').notNull().unique(),
  ...timestamps,
});

// Restaurants table (M28: restaurant tracking)
export const restaurants = sqliteTable('restaurants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  cuisineType: text('cuisine_type'),
  location: text('location'),
  notes: text('notes'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  createdById: text('created_by_id')
    .notNull()
    .references(() => users.id),
  ...timestamps,
});

// Restaurant dishes (freeform, not linked to home recipes)
export const restaurantDishes = sqliteTable('restaurant_dishes', {
  id: text('id').primaryKey(),
  restaurantId: text('restaurant_id')
    .notNull()
    .references(() => restaurants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  notes: text('notes'),
  ...timestamps,
});

// Per-dish rating at a restaurant (per user per dish)
export const restaurantDishRatings = sqliteTable('restaurant_dish_ratings', {
  id: text('id').primaryKey(),
  restaurantDishId: text('restaurant_dish_id')
    .notNull()
    .references(() => restaurantDishes.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  stars: integer('stars').notNull(),
  note: text('note'),
  ...timestamps,
});

// Dinner entries table
export const dinnerEntries = sqliteTable('dinner_entries', {
  id: text('id').primaryKey(),
  menuId: text('menu_id')
    .notNull()
    .references(() => weeklyMenus.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  type: text('type', {
    enum: ['assembled', 'fend_for_self', 'dining_out', 'custom', 'leftovers'],
  })
    .notNull()
    .default('assembled'),
  customText: text('custom_text'),
  customSideText: text('custom_side_text'),
  restaurantName: text('restaurant_name'),
  restaurantNotes: text('restaurant_notes'),
  restaurantId: text('restaurant_id').references(() => restaurants.id),
  mainDishId: text('main_dish_id').references(() => dishes.id),
  sourceEntryId: text('source_entry_id').references((): AnySQLiteColumn => dinnerEntries.id),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  skipped: integer('skipped', { mode: 'boolean' }).notNull().default(false),
  scale: integer('scale').notNull().default(1),
  ...timestamps,
});

// Entry side dishes junction table
export const entrySideDishes = sqliteTable('entry_side_dishes', {
  entryId: text('entry_id')
    .notNull()
    .references(() => dinnerEntries.id, { onDelete: 'cascade' }),
  dishId: text('dish_id')
    .notNull()
    .references(() => dishes.id),
});

// Preparations table
export const preparations = sqliteTable('preparations', {
  id: text('id').primaryKey(),
  dishId: text('dish_id').references(() => dishes.id),
  restaurantId: text('restaurant_id').references(() => restaurants.id),
  dinnerEntryId: text('dinner_entry_id')
    .notNull()
    .references(() => dinnerEntries.id),
  preparedDate: text('prepared_date').notNull(),
  notes: text('notes'),
  ...timestamps,
});

// Preparation preparers join table (M15: multiple preparers)
export const preparationPreparers = sqliteTable(
  'preparation_preparers',
  {
    preparationId: text('preparation_id')
      .notNull()
      .references(() => preparations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.preparationId, table.userId] })]
);

// Prep tasks table (M13: prep scheduling)
export const prepTasks = sqliteTable('prep_tasks', {
  id: text('id').primaryKey(),
  entryId: text('entry_id')
    .notNull()
    .references(() => dinnerEntries.id, { onDelete: 'cascade' }),
  description: text('description').notNull(),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  ...timestamps,
});

// Dish notes table (M14: recipe notes & cook log)
export const dishNotes = sqliteTable('dish_notes', {
  id: text('id').primaryKey(),
  dishId: text('dish_id')
    .notNull()
    .references(() => dishes.id, { onDelete: 'cascade' }),
  note: text('note').notNull(),
  createdById: text('created_by_id').references(() => users.id),
  createdAt: text('created_at').notNull(),
});

// Ratings table
export const ratings = sqliteTable('ratings', {
  id: text('id').primaryKey(),
  preparationId: text('preparation_id')
    .notNull()
    .references(() => preparations.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  stars: integer('stars').notNull(),
  note: text('note'),
  ...timestamps,
});

// App settings table
export const appSettings = sqliteTable('app_settings', {
  id: text('id').primaryKey().default('default'),
  weekStartDay: integer('week_start_day').notNull().default(0), // 0 = Sunday
  recencyWindowDays: integer('recency_window_days').notNull().default(30),
  ollamaUrl: text('ollama_url'),
  ollamaModel: text('ollama_model').default('gemma4-e4b'),
  llmMode: text('llm_mode').default('disabled'),
  n8nWebhookUrl: text('n8n_webhook_url'),
  videoStorageLimitMb: integer('video_storage_limit_mb').default(10240),
  ...timestamps,
});

// Recurring meal patterns table
export const recurringPatterns = sqliteTable('recurring_patterns', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  dayOfWeek: integer('day_of_week').notNull(), // 0=Sun, 1=Mon, ..., 6=Sat
  type: text('type', { enum: ['assembled', 'fend_for_self', 'dining_out', 'custom'] })
    .notNull()
    .default('assembled'),
  mainDishId: text('main_dish_id').references(() => dishes.id, { onDelete: 'set null' }),
  customText: text('custom_text'),
  createdById: text('created_by_id')
    .notNull()
    .references(() => users.id),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Pattern side dishes junction table
export const patternSideDishes = sqliteTable(
  'pattern_side_dishes',
  {
    patternId: text('pattern_id')
      .notNull()
      .references(() => recurringPatterns.id, { onDelete: 'cascade' }),
    dishId: text('dish_id')
      .notNull()
      .references(() => dishes.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.patternId, table.dishId] })]
);

// Photos table (linked to preparations)
export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(),
  preparationId: text('preparation_id')
    .notNull()
    .references(() => preparations.id, { onDelete: 'cascade' }),
  uploadedById: text('uploaded_by_id')
    .notNull()
    .references(() => users.id),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(), // bytes
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Pantry items table (M16: pantry tracking)
export const pantryItems = sqliteTable('pantry_items', {
  id: text('id').primaryKey(),
  ingredientName: text('ingredient_name').notNull(),
  quantity: real('quantity'),
  unit: text('unit'),
  expiresAt: text('expires_at'), // ISO date string YYYY-MM-DD, nullable
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Stores table (M25: managed store list for grocery organization)
export const stores = sqliteTable('stores', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Ingredient <-> Store junction table (M25)
export const ingredientStores = sqliteTable(
  'ingredient_stores',
  {
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.ingredientId, table.storeId] })]
);

// Custom grocery items table (M23: user-added free-form grocery items)
export const customGroceryItems = sqliteTable('custom_grocery_items', {
  id: text('id').primaryKey(),
  weekDate: text('week_date').notNull(),
  name: text('name').notNull(),
  quantity: real('quantity'),
  unit: text('unit'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  storeId: text('store_id').references(() => stores.id, { onDelete: 'set null' }),
});

// Grocery checks table (M24: shared server-side check state)
export const groceryChecks = sqliteTable(
  'grocery_checks',
  {
    weekDate: text('week_date').notNull(),
    itemKey: text('item_key').notNull(),
    itemName: text('item_name').notNull(),
    checkedByUserId: text('checked_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    checkedAt: text('checked_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [primaryKey({ columns: [table.weekDate, table.itemKey] })]
);

// Standing grocery items table (M26: items that always appear on the grocery list)
export const standingItems = sqliteTable('standing_items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  quantity: real('quantity'),
  unit: text('unit'),
  category: text('category').notNull().default('Other'),
  storeId: text('store_id').references(() => stores.id, { onDelete: 'set null' }),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Refresh tokens table (for auth)
export const refreshTokens = sqliteTable('refresh_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const apiTokens = sqliteTable('api_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  lastUsedAt: text('last_used_at'),
  expiresAt: text('expires_at'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// App events table (admin audit log)
export const appEvents = sqliteTable('app_events', {
  id: text('id').primaryKey(),
  level: text('level', { enum: ['info', 'warn', 'error'] })
    .notNull()
    .default('info'),
  category: text('category', { enum: ['auth', 'admin', 'video', 'cleanup', 'system'] }).notNull(),
  message: text('message').notNull(),
  details: text('details'), // JSON string for structured data
  userId: text('user_id'), // nullable — system events have no user
  createdAt: text('created_at').notNull(),
});

// Video download job queue
export const videoJobs = sqliteTable('video_jobs', {
  id: text('id').primaryKey(),
  dishId: text('dish_id').references(() => dishes.id, { onDelete: 'set null' }),
  sourceUrl: text('source_url').notNull(),
  status: text('status', { enum: ['pending', 'downloading', 'extracting', 'complete', 'failed'] })
    .notNull()
    .default('pending'),
  progress: integer('progress').default(0),
  resultVideoFilename: text('result_video_filename'),
  resultMetadata: text('result_metadata'),
  extractedRecipe: text('extracted_recipe'),
  error: text('error'),
  ...timestamps,
});
