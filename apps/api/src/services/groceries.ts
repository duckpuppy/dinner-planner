import { inArray, asc, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { GroceryItem } from '@dinner-planner/shared';
import { getOrCreateWeekMenu } from './menus.js';
import { listPantryItems } from './pantry.js';

interface IngredientSource {
  dishName: string;
  quantity: number | null;
  unit: string | null;
  name: string;
  notes: string | null;
  category: string;
  storeNames: string[];
}

/**
 * Aggregate a flat list of ingredient sources into deduplicated grocery items.
 * Groups by (name.toLowerCase(), unit?.toLowerCase()), summing quantities.
 * Quantity becomes null if any contributing ingredient has null quantity.
 * Category: first source wins. Stores: union (deduplicated).
 */
export function aggregateIngredients(sources: IngredientSource[]): GroceryItem[] {
  const map = new Map<string, GroceryItem>();

  for (const src of sources) {
    const key = `${src.name.toLowerCase()}::${src.unit?.toLowerCase() ?? ''}`;
    const existing = map.get(key);

    if (existing) {
      if (src.quantity !== null && existing.quantity !== null) {
        existing.quantity += src.quantity;
      } else {
        existing.quantity = null;
      }
      if (!existing.dishes.includes(src.dishName)) {
        existing.dishes.push(src.dishName);
      }
      if (src.notes && !existing.notes.includes(src.notes)) {
        existing.notes.push(src.notes);
      }
      // category: first wins (no change)
      // stores: union
      for (const s of src.storeNames) {
        if (!existing.stores.includes(s)) existing.stores.push(s);
      }
    } else {
      map.set(key, {
        name: src.name,
        quantity: src.quantity,
        unit: src.unit,
        dishes: [src.dishName],
        notes: src.notes ? [src.notes] : [],
        inPantry: false,
        category: src.category,
        stores: [...src.storeNames],
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Build a grocery list for the week containing the given date.
 * Only considers assembled entries with a main dish or side dishes.
 * Returns aggregated ingredients sorted alphabetically.
 */
export async function getWeekGroceries(
  date: string
): Promise<{ groceries: GroceryItem[]; weekStartDate: string }> {
  const menu = await getOrCreateWeekMenu(date);

  // Collect all dish IDs from assembled entries
  const dishIdToName = new Map<string, string>();

  for (const entry of menu.entries) {
    if (entry.type !== 'assembled') continue;
    if (entry.mainDish) {
      dishIdToName.set(entry.mainDish.id, entry.mainDish.name);
    }
    for (const side of entry.sideDishes) {
      dishIdToName.set(side.id, side.name);
    }
  }

  if (dishIdToName.size === 0) {
    return { groceries: [], weekStartDate: menu.weekStartDate };
  }

  const dishIds = Array.from(dishIdToName.keys());

  const ingredientRows = await db
    .select()
    .from(schema.ingredients)
    .where(inArray(schema.ingredients.dishId, dishIds))
    .orderBy(asc(schema.ingredients.sortOrder));

  // Fetch store names for all ingredient IDs
  const ingredientIds = ingredientRows.map((r) => r.id);
  const storesByIngredient = new Map<string, string[]>();
  if (ingredientIds.length > 0) {
    const storeRows = await db
      .select({
        ingredientId: schema.ingredientStores.ingredientId,
        storeName: schema.stores.name,
      })
      .from(schema.ingredientStores)
      .innerJoin(schema.stores, eq(schema.ingredientStores.storeId, schema.stores.id))
      .where(inArray(schema.ingredientStores.ingredientId, ingredientIds));

    for (const row of storeRows) {
      const existing = storesByIngredient.get(row.ingredientId) ?? [];
      existing.push(row.storeName);
      storesByIngredient.set(row.ingredientId, existing);
    }
  }

  const sources: IngredientSource[] = ingredientRows.map((ing) => ({
    dishName: dishIdToName.get(ing.dishId) ?? 'Unknown',
    quantity: ing.quantity,
    unit: ing.unit,
    name: ing.name,
    notes: ing.notes,
    category: ing.category,
    storeNames: storesByIngredient.get(ing.id) ?? [],
  }));

  const groceries = aggregateIngredients(sources);

  // Mark pantry-covered items
  const pantryItems = await listPantryItems();
  const pantryNames = new Set(pantryItems.map((p) => p.ingredientName.trim().toLowerCase()));

  for (const item of groceries) {
    if (pantryNames.has(item.name.trim().toLowerCase())) {
      item.inPantry = true;
    }
  }

  return {
    groceries,
    weekStartDate: menu.weekStartDate,
  };
}
