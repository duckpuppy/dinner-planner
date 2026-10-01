/**
 * Service tests for idempotent create/delete of custom grocery items,
 * standing items and pantry items, against a real in-memory SQLite database
 * (all migrations applied) so the ON CONFLICT and family-scoping logic is
 * actually exercised.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';

const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('../db/index.js', async () => {
  const actualSchema = await import('../db/schema.js');
  return {
    schema: actualSchema,
    get db() {
      return holder.db;
    },
  };
});

import { addCustomItem, deleteCustomItem } from '../services/customGroceries.js';
import { addStandingItem, deleteStandingItem } from '../services/standingItems.js';
import { createPantryItem, deletePantryItem } from '../services/pantry.js';

const WEEK = '2026-02-24';
const ID = '11111111-1111-4111-8111-111111111111';

let sqlite: Database.Database;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(() => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = OFF');
  testDb = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: './drizzle' });
  sqlite.pragma('foreign_keys = ON');
  holder.db = testDb;
});

beforeEach(() => {
  sqlite.exec(
    'DELETE FROM custom_grocery_items; DELETE FROM standing_items; DELETE FROM pantry_items; DELETE FROM grocery_checks; DELETE FROM users; DELETE FROM families;'
  );
  for (const f of ['fam-a', 'fam-b']) {
    testDb.insert(schema.families).values({ id: f, name: f }).run();
  }
  for (const [id, familyId] of [
    ['u-a', 'fam-a'],
    ['u-b', 'fam-b'],
  ]) {
    testDb
      .insert(schema.users)
      .values({ id, username: id, displayName: id, passwordHash: 'x', familyId })
      .run();
  }
});

const countRows = (table: string) =>
  (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

describe('custom grocery items', () => {
  it('creates without an id (server-generated)', async () => {
    const r = await addCustomItem(WEEK, 'Milk', 2, 'l', undefined, 'fam-a');
    expect(r?.created).toBe(true);
    expect(r?.item.id).toBeTruthy();
    expect(r?.item.name).toBe('Milk');
  });

  it('creates with a new client id', async () => {
    const r = await addCustomItem(WEEK, 'Milk', null, null, undefined, 'fam-a', ID);
    expect(r?.created).toBe(true);
    expect(r?.item.id).toBe(ID);
  });

  it('replay returns the existing row unchanged (first write wins)', async () => {
    await addCustomItem(WEEK, 'Milk', 2, 'l', undefined, 'fam-a', ID);
    const r = await addCustomItem(WEEK, 'Bread', 9, 'kg', undefined, 'fam-a', ID);
    expect(r?.created).toBe(false);
    expect(r?.item).toMatchObject({ id: ID, name: 'Milk', quantity: 2, unit: 'l' });
    expect(countRows('custom_grocery_items')).toBe(1);
  });

  it('returns null and creates nothing when the id belongs to another family', async () => {
    await addCustomItem(WEEK, 'Milk', null, null, undefined, 'fam-a', ID);
    const r = await addCustomItem(WEEK, 'Hijack', null, null, undefined, 'fam-b', ID);
    expect(r).toBeNull();
    expect(countRows('custom_grocery_items')).toBe(1);
    const row = testDb
      .select()
      .from(schema.customGroceryItems)
      .where(eq(schema.customGroceryItems.id, ID))
      .get();
    expect(row).toMatchObject({ familyId: 'fam-a', name: 'Milk' });
  });

  it('delete is idempotent and reports whether a row changed', async () => {
    await addCustomItem(WEEK, 'Milk', null, null, undefined, 'fam-a', ID);
    expect(await deleteCustomItem(ID, 'fam-a')).toEqual({ deleted: true });
    expect(await deleteCustomItem(ID, 'fam-a')).toEqual({ deleted: false });
    expect(await deleteCustomItem('never-existed', 'fam-a')).toEqual({ deleted: false });
  });

  it('cross-family delete does nothing', async () => {
    await addCustomItem(WEEK, 'Milk', null, null, undefined, 'fam-a', ID);
    expect(await deleteCustomItem(ID, 'fam-b')).toEqual({ deleted: false });
    expect(countRows('custom_grocery_items')).toBe(1);
  });

  it('deleting leaves the item grocery_checks row alone (existing behaviour)', async () => {
    await addCustomItem(WEEK, 'Milk', null, null, undefined, 'fam-a', ID);
    testDb
      .insert(schema.groceryChecks)
      .values({
        familyId: 'fam-a',
        weekDate: WEEK,
        itemKey: `custom::${ID}`,
        itemName: 'Milk',
        checkedByUserId: 'u-a',
      })
      .run();
    await deleteCustomItem(ID, 'fam-a');
    expect(countRows('grocery_checks')).toBe(1);
  });
});

describe('standing items', () => {
  it('creates without an id', async () => {
    const r = await addStandingItem('Eggs', null, null, 'Dairy', undefined, 'u-a', 'fam-a');
    expect(r?.created).toBe(true);
    expect(r?.item.category).toBe('Dairy');
  });

  it('creates with a new client id', async () => {
    const r = await addStandingItem('Eggs', null, null, 'Other', undefined, 'u-a', 'fam-a', ID);
    expect(r?.created).toBe(true);
    expect(r?.item.id).toBe(ID);
  });

  it('replay returns the existing row unchanged', async () => {
    await addStandingItem('Eggs', 12, null, 'Dairy', undefined, 'u-a', 'fam-a', ID);
    const r = await addStandingItem('Other', 1, 'kg', 'Meat', undefined, 'u-a', 'fam-a', ID);
    expect(r?.created).toBe(false);
    expect(r?.item).toMatchObject({ id: ID, name: 'Eggs', quantity: 12, category: 'Dairy' });
    expect(countRows('standing_items')).toBe(1);
  });

  it('returns null and creates nothing when the id belongs to another family', async () => {
    await addStandingItem('Eggs', null, null, 'Other', undefined, 'u-a', 'fam-a', ID);
    const r = await addStandingItem('Hijack', null, null, 'Other', undefined, 'u-b', 'fam-b', ID);
    expect(r).toBeNull();
    expect(countRows('standing_items')).toBe(1);
  });

  it('delete is idempotent; cross-family delete leaves the row', async () => {
    await addStandingItem('Eggs', null, null, 'Other', undefined, 'u-a', 'fam-a', ID);
    expect(await deleteStandingItem(ID, 'fam-b')).toEqual({ deleted: false });
    expect(countRows('standing_items')).toBe(1);
    expect(await deleteStandingItem(ID, 'fam-a')).toEqual({ deleted: true });
    expect(await deleteStandingItem(ID, 'fam-a')).toEqual({ deleted: false });
  });
});

describe('pantry items', () => {
  it('creates without an id', async () => {
    const r = await createPantryItem({ ingredientName: 'Flour' }, 'fam-a');
    expect(r?.created).toBe(true);
    expect(r?.item.ingredientName).toBe('Flour');
  });

  it('creates with a new client id', async () => {
    const r = await createPantryItem({ id: ID, ingredientName: 'Flour' }, 'fam-a');
    expect(r?.created).toBe(true);
    expect(r?.item.id).toBe(ID);
  });

  it('replay returns the existing row unchanged', async () => {
    await createPantryItem({ id: ID, ingredientName: 'Flour', quantity: 2, unit: 'kg' }, 'fam-a');
    const r = await createPantryItem({ id: ID, ingredientName: 'Sugar', quantity: 5 }, 'fam-a');
    expect(r?.created).toBe(false);
    expect(r?.item).toMatchObject({ id: ID, ingredientName: 'Flour', quantity: 2, unit: 'kg' });
    expect(countRows('pantry_items')).toBe(1);
  });

  it('returns null and creates nothing when the id belongs to another family', async () => {
    await createPantryItem({ id: ID, ingredientName: 'Flour' }, 'fam-a');
    const r = await createPantryItem({ id: ID, ingredientName: 'Hijack' }, 'fam-b');
    expect(r).toBeNull();
    expect(countRows('pantry_items')).toBe(1);
  });

  it('delete is idempotent; cross-family delete leaves the row', async () => {
    await createPantryItem({ id: ID, ingredientName: 'Flour' }, 'fam-a');
    expect(await deletePantryItem(ID, 'fam-b')).toEqual({ deleted: false });
    expect(countRows('pantry_items')).toBe(1);
    expect(await deletePantryItem(ID, 'fam-a')).toEqual({ deleted: true });
    expect(await deletePantryItem(ID, 'fam-a')).toEqual({ deleted: false });
  });
});
