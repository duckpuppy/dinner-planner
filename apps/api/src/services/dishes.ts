import crypto from 'crypto';
import { eq, and, like, desc, asc, sql, or, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { CreateDishInput, UpdateDishInput, DishQueryInput } from '@dinner-planner/shared';

export interface DishResponse {
  id: string;
  name: string;
  description: string;
  type: 'main' | 'side';
  instructions: string;
  prepTime: number | null;
  cookTime: number | null;
  servings: number | null;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  sourceUrl: string | null;
  videoUrl: string | null;
  archived: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  ingredients: IngredientResponse[];
  tags: string[];
  dietaryTags: string[];
}

export interface IngredientResponse {
  id: string;
  quantity: number | null;
  unit: string | null;
  name: string;
  notes: string | null;
  sortOrder: number;
  category: string;
  stores: string[];
}

function toIngredientResponse(
  ingredient: typeof schema.ingredients.$inferSelect,
  storeNames: string[] = []
): IngredientResponse {
  return {
    id: ingredient.id,
    quantity: ingredient.quantity,
    unit: ingredient.unit,
    name: ingredient.name,
    notes: ingredient.notes,
    sortOrder: ingredient.sortOrder,
    category: ingredient.category,
    stores: storeNames,
  };
}

/**
 * Fetch store names for a list of ingredient IDs. Returns a Map<ingredientId, storeName[]>.
 */
async function fetchStoresByIngredient(ingredientIds: string[]): Promise<Map<string, string[]>> {
  if (ingredientIds.length === 0) return new Map();
  const rows = await db
    .select({
      ingredientId: schema.ingredientStores.ingredientId,
      storeName: schema.stores.name,
    })
    .from(schema.ingredientStores)
    .innerJoin(schema.stores, eq(schema.ingredientStores.storeId, schema.stores.id))
    .where(inArray(schema.ingredientStores.ingredientId, ingredientIds));

  const result = new Map<string, string[]>();
  for (const row of rows) {
    const existing = result.get(row.ingredientId) ?? [];
    existing.push(row.storeName);
    result.set(row.ingredientId, existing);
  }
  return result;
}

/**
 * Insert ingredient_stores rows for a set of ingredient IDs and store IDs.
 */
async function insertIngredientStores(ingredientId: string, storeIds: string[]): Promise<void> {
  if (storeIds.length === 0) return;
  await db.insert(schema.ingredientStores).values(
    storeIds.map((storeId) => ({ ingredientId, storeId }))
  );
}

async function getDishWithRelations(id: string): Promise<DishResponse | null> {
  const dish = await db.query.dishes.findFirst({
    where: eq(schema.dishes.id, id),
  });

  if (!dish) return null;

  const ingredients = await db
    .select()
    .from(schema.ingredients)
    .where(eq(schema.ingredients.dishId, id))
    .orderBy(asc(schema.ingredients.sortOrder));

  const storesByIngredient = await fetchStoresByIngredient(ingredients.map((i) => i.id));

  const dishTags = await db
    .select({ name: schema.tags.name })
    .from(schema.dishTags)
    .innerJoin(schema.tags, eq(schema.dishTags.tagId, schema.tags.id))
    .where(eq(schema.dishTags.dishId, id));

  const dietaryTagRows = await db
    .select({ tag: schema.dishDietaryTags.tag })
    .from(schema.dishDietaryTags)
    .where(eq(schema.dishDietaryTags.dishId, id));

  return {
    id: dish.id,
    name: dish.name,
    description: dish.description,
    type: dish.type,
    instructions: dish.instructions,
    prepTime: dish.prepTime,
    cookTime: dish.cookTime,
    servings: dish.servings,
    calories: dish.calories,
    proteinG: dish.proteinG,
    carbsG: dish.carbsG,
    fatG: dish.fatG,
    sourceUrl: dish.sourceUrl,
    videoUrl: dish.videoUrl,
    archived: dish.archived,
    createdById: dish.createdById,
    createdAt: dish.createdAt,
    updatedAt: dish.updatedAt,
    ingredients: ingredients.map((ing) => toIngredientResponse(ing, storesByIngredient.get(ing.id) ?? [])),
    tags: dishTags.map((t) => t.name),
    dietaryTags: dietaryTagRows.map((r) => r.tag),
  };
}

/**
 * Get all dishes with filtering and pagination
 */
export async function getDishes(
  query: DishQueryInput
): Promise<{ dishes: DishResponse[]; total: number }> {
  const conditions = [];

  // Filter by archived status
  conditions.push(eq(schema.dishes.archived, query.archived));

  // Filter by type
  if (query.type) {
    conditions.push(eq(schema.dishes.type, query.type));
  }

  // Search by name or description
  if (query.search) {
    const searchPattern = `%${query.search}%`;
    conditions.push(
      or(like(schema.dishes.name, searchPattern), like(schema.dishes.description, searchPattern))
    );
  }

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.dishes)
    .where(and(...conditions));

  const total = countResult[0]?.count ?? 0;

  // Build order clause
  let orderClause;
  switch (query.sort) {
    case 'name':
      orderClause = query.order === 'desc' ? desc(schema.dishes.name) : asc(schema.dishes.name);
      break;
    case 'created':
      orderClause =
        query.order === 'desc' ? desc(schema.dishes.createdAt) : asc(schema.dishes.createdAt);
      break;
    case 'recent':
      orderClause = desc(schema.dishes.updatedAt);
      break;
    default:
      orderClause = asc(schema.dishes.name);
  }

  // Get dishes
  const dishes = await db
    .select()
    .from(schema.dishes)
    .where(and(...conditions))
    .orderBy(orderClause)
    .limit(query.limit)
    .offset(query.offset);

  // Get related data for each dish
  const dishesWithRelations = await Promise.all(
    dishes.map(async (dish) => {
      const result = await getDishWithRelations(dish.id);
      return result!;
    })
  );

  // Filter by free-form tag if specified (post-query since tags are in a junction table)
  let filteredDishes = dishesWithRelations;
  if (query.tag) {
    filteredDishes = filteredDishes.filter((dish) =>
      dish.tags.some((t) => t.toLowerCase() === query.tag!.toLowerCase())
    );
  }

  // Filter by dietary tags if specified (dish must have ALL requested tags)
  if (query.dietaryTags && query.dietaryTags.length > 0) {
    filteredDishes = filteredDishes.filter((dish) =>
      query.dietaryTags!.every((dt) => dish.dietaryTags.includes(dt))
    );
  }

  const filteredTotal =
    query.tag || (query.dietaryTags && query.dietaryTags.length > 0)
      ? filteredDishes.length
      : total;
  return { dishes: filteredDishes, total: filteredTotal };
}

/**
 * Get dish by ID
 */
export async function getDishById(id: string): Promise<DishResponse | null> {
  return getDishWithRelations(id);
}

/**
 * Create a new dish
 */
export async function createDish(input: CreateDishInput, userId: string): Promise<DishResponse> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Insert dish
  await db.insert(schema.dishes).values({
    id,
    name: input.name,
    description: input.description,
    type: input.type,
    instructions: input.instructions,
    prepTime: input.prepTime,
    cookTime: input.cookTime,
    servings: input.servings,
    calories: input.calories,
    proteinG: input.proteinG,
    carbsG: input.carbsG,
    fatG: input.fatG,
    sourceUrl: input.sourceUrl,
    videoUrl: input.videoUrl,
    archived: false,
    createdById: userId,
    createdAt: now,
    updatedAt: now,
  });

  // Insert ingredients (with category and store associations)
  if (input.ingredients && input.ingredients.length > 0) {
    for (let index = 0; index < input.ingredients.length; index++) {
      const ing = input.ingredients[index];
      const ingId = crypto.randomUUID();
      await db.insert(schema.ingredients).values({
        id: ingId,
        dishId: id,
        quantity: ing.quantity,
        unit: ing.unit,
        name: ing.name,
        notes: ing.notes,
        sortOrder: index,
        category: ing.category ?? 'Other',
      });
      await insertIngredientStores(ingId, ing.storeIds ?? []);
    }
  }

  // Handle free-form tags
  if (input.tags && input.tags.length > 0) {
    for (const tagName of input.tags) {
      // Find or create tag
      let tag = await db.query.tags.findFirst({
        where: eq(schema.tags.name, tagName.toLowerCase()),
      });

      if (!tag) {
        const tagId = crypto.randomUUID();
        await db.insert(schema.tags).values({
          id: tagId,
          name: tagName.toLowerCase(),
        });
        tag = { id: tagId, name: tagName.toLowerCase() };
      }

      // Link tag to dish
      await db.insert(schema.dishTags).values({
        dishId: id,
        tagId: tag.id,
      });
    }
  }

  // Handle dietary tags
  if (input.dietaryTags && input.dietaryTags.length > 0) {
    await db
      .insert(schema.dishDietaryTags)
      .values(input.dietaryTags.map((tag) => ({ dishId: id, tag })));
  }

  return (await getDishWithRelations(id))!;
}

/**
 * Update a dish
 */
export async function updateDish(id: string, input: UpdateDishInput): Promise<DishResponse | null> {
  const dish = await db.query.dishes.findFirst({
    where: eq(schema.dishes.id, id),
  });

  if (!dish) return null;

  const now = new Date().toISOString();

  // Update dish fields
  const updateData: Record<string, unknown> = { updatedAt: now };
  if (input.name !== undefined) updateData.name = input.name;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.type !== undefined) updateData.type = input.type;
  if (input.instructions !== undefined) updateData.instructions = input.instructions;
  if (input.prepTime !== undefined) updateData.prepTime = input.prepTime;
  if (input.cookTime !== undefined) updateData.cookTime = input.cookTime;
  if (input.servings !== undefined) updateData.servings = input.servings;
  if (input.calories !== undefined) updateData.calories = input.calories;
  if (input.proteinG !== undefined) updateData.proteinG = input.proteinG;
  if (input.carbsG !== undefined) updateData.carbsG = input.carbsG;
  if (input.fatG !== undefined) updateData.fatG = input.fatG;
  if (input.sourceUrl !== undefined) updateData.sourceUrl = input.sourceUrl;
  if (input.videoUrl !== undefined) updateData.videoUrl = input.videoUrl;

  await db.update(schema.dishes).set(updateData).where(eq(schema.dishes.id, id));

  // Update ingredients if provided
  if (input.ingredients !== undefined) {
    // Delete existing ingredients (cascade removes ingredient_stores rows)
    await db.delete(schema.ingredients).where(eq(schema.ingredients.dishId, id));

    // Insert new ingredients with category and store associations
    for (let index = 0; index < input.ingredients.length; index++) {
      const ing = input.ingredients[index];
      const ingId = crypto.randomUUID();
      await db.insert(schema.ingredients).values({
        id: ingId,
        dishId: id,
        quantity: ing.quantity,
        unit: ing.unit,
        name: ing.name,
        notes: ing.notes,
        sortOrder: index,
        category: ing.category ?? 'Other',
      });
      await insertIngredientStores(ingId, ing.storeIds ?? []);
    }
  }

  // Update free-form tags if provided
  if (input.tags !== undefined) {
    // Delete existing tag links
    await db.delete(schema.dishTags).where(eq(schema.dishTags.dishId, id));

    // Add new tags
    for (const tagName of input.tags) {
      let tag = await db.query.tags.findFirst({
        where: eq(schema.tags.name, tagName.toLowerCase()),
      });

      if (!tag) {
        const tagId = crypto.randomUUID();
        await db.insert(schema.tags).values({
          id: tagId,
          name: tagName.toLowerCase(),
        });
        tag = { id: tagId, name: tagName.toLowerCase() };
      }

      await db.insert(schema.dishTags).values({
        dishId: id,
        tagId: tag.id,
      });
    }
  }

  // Update dietary tags if provided (replace all)
  if (input.dietaryTags !== undefined) {
    await db.delete(schema.dishDietaryTags).where(eq(schema.dishDietaryTags.dishId, id));

    if (input.dietaryTags.length > 0) {
      await db
        .insert(schema.dishDietaryTags)
        .values(input.dietaryTags.map((tag) => ({ dishId: id, tag })));
    }
  }

  return getDishWithRelations(id);
}

/**
 * Archive a dish (soft delete)
 */
export async function archiveDish(id: string): Promise<DishResponse | null> {
  const dish = await db.query.dishes.findFirst({
    where: eq(schema.dishes.id, id),
  });

  if (!dish) return null;

  const now = new Date().toISOString();

  await db
    .update(schema.dishes)
    .set({ archived: true, updatedAt: now })
    .where(eq(schema.dishes.id, id));

  return getDishWithRelations(id);
}

/**
 * Unarchive a dish
 */
export async function unarchiveDish(id: string): Promise<DishResponse | null> {
  const dish = await db.query.dishes.findFirst({
    where: eq(schema.dishes.id, id),
  });

  if (!dish) return null;

  const now = new Date().toISOString();

  await db
    .update(schema.dishes)
    .set({ archived: false, updatedAt: now })
    .where(eq(schema.dishes.id, id));

  return getDishWithRelations(id);
}

/**
 * Permanently delete a dish (admin only)
 */
export async function deleteDish(id: string): Promise<{ success: boolean; error?: string }> {
  const dish = await db.query.dishes.findFirst({
    where: eq(schema.dishes.id, id),
  });

  if (!dish) {
    return { success: false, error: 'Dish not found' };
  }

  // Handle foreign key constraints before deleting
  // 1. Nullify dinnerEntries.mainDishId referencing this dish
  await db
    .update(schema.dinnerEntries)
    .set({ mainDishId: null })
    .where(eq(schema.dinnerEntries.mainDishId, id));

  // 2. Delete from entrySideDishes (side dish references)
  await db.delete(schema.entrySideDishes).where(eq(schema.entrySideDishes.dishId, id));

  // 3. Get all preparations for this dish
  const preps = await db
    .select({ id: schema.preparations.id })
    .from(schema.preparations)
    .where(eq(schema.preparations.dishId, id));

  // 4. Delete ratings for these preparations
  if (preps.length > 0) {
    const prepIds = preps.map((p) => p.id);
    for (const prepId of prepIds) {
      await db.delete(schema.ratings).where(eq(schema.ratings.preparationId, prepId));
    }
  }

  // 5. Delete preparations for this dish
  await db.delete(schema.preparations).where(eq(schema.preparations.dishId, id));

  // 6. Delete the dish (ingredients, dish_tags, and dish_dietary_tags cascade automatically)
  await db.delete(schema.dishes).where(eq(schema.dishes.id, id));

  return { success: true };
}

/**
 * Get all tags
 */
export async function getAllTags(): Promise<{ name: string; count: number }[]> {
  const result = await db
    .select({
      name: schema.tags.name,
      count: sql<number>`count(${schema.dishTags.dishId})`,
    })
    .from(schema.tags)
    .leftJoin(schema.dishTags, eq(schema.tags.id, schema.dishTags.tagId))
    .groupBy(schema.tags.name)
    .orderBy(asc(schema.tags.name));

  return result;
}

/**
 * Get dishes by IDs (batch fetch)
 */
export async function getDishesByIds(ids: string[]): Promise<DishResponse[]> {
  if (ids.length === 0) return [];
  return Promise.all(ids.map((id) => getDishWithRelations(id).then((r) => r!)));
}
