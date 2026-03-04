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

  // Collect dish+scale pairs from assembled entries (allows same dish at different scales)
  const dishEntries: Array<{ dishId: string; dishName: string; scale: number }> = [];

  for (const entry of menu.entries) {
    if (entry.type !== 'assembled') continue;
    const scale = entry.scale ?? 1;
    if (entry.mainDish) {
      dishEntries.push({ dishId: entry.mainDish.id, dishName: entry.mainDish.name, scale });
    }
    for (const side of entry.sideDishes) {
      dishEntries.push({ dishId: side.id, dishName: side.name, scale });
    }
  }

  if (dishEntries.length === 0) {
    return { groceries: [], weekStartDate: menu.weekStartDate };
  }

  // Fetch ingredients for all unique dish IDs
  const dishIds = [...new Set(dishEntries.map((e) => e.dishId))];

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

  // Build sources, expanding by entry occurrences and applying per-entry scale
  const sources: IngredientSource[] = [];
  for (const { dishId, dishName, scale } of dishEntries) {
    const ings = ingredientRows.filter((r) => r.dishId === dishId);
    for (const ing of ings) {
      sources.push({
        dishName,
        name: ing.name,
        quantity: ing.quantity !== null ? ing.quantity * scale : null,
        unit: ing.unit,
        notes: ing.notes,
        category: ing.category,
        storeNames: storesByIngredient.get(ing.id) ?? [],
      });
    }
  }

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
