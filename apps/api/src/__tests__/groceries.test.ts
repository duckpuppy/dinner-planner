import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  inArray: vi.fn().mockReturnValue(null),
  asc: vi.fn().mockReturnValue(null),
  eq: vi.fn().mockReturnValue(null),
  sql: vi.fn().mockReturnValue(null),
}));

// Mock db to avoid loading native better-sqlite3 bindings in unit tests
vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    ingredients: { dishId: null, sortOrder: null, id: null },
    ingredientStores: { ingredientId: null, storeId: null },
    stores: { name: null, id: null },
  },
}));

const mockGetOrCreateWeekMenu = vi.hoisted(() => vi.fn());
const mockListPantryItems = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock('../services/menus.js', () => ({
  getOrCreateWeekMenu: mockGetOrCreateWeekMenu,
}));

vi.mock('../services/pantry.js', () => ({
  listPantryItems: mockListPantryItems,
}));

import { aggregateIngredients, getWeekGroceries } from '../services/groceries.js';

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeSrc(overrides: Partial<{
  dishName: string;
  quantity: number | null;
  unit: string | null;
  name: string;
  notes: string | null;
  category: string;
  storeNames: string[];
}> = {}) {
  return {
    dishName: 'Dish',
    quantity: 1,
    unit: null,
    name: 'Salt',
    notes: null,
    category: 'Other',
    storeNames: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// aggregateIngredients
// ---------------------------------------------------------------------------

describe('aggregateIngredients', () => {
  it('returns empty array for no inputs', () => {
    expect(aggregateIngredients([])).toEqual([]);
  });

  it('returns single item unchanged', () => {
    const result = aggregateIngredients([
      makeSrc({ dishName: 'Pasta', quantity: 200, unit: 'g', name: 'Flour', category: 'Pantry Staples', storeNames: ['Aldi'] }),
    ]);
    expect(result).toEqual([
      {
        name: 'Flour',
        quantity: 200,
        unit: 'g',
        dishes: ['Pasta'],
        notes: [],
        inPantry: false,
        category: 'Pantry Staples',
        stores: ['Aldi'],
      },
    ]);
  });

  it('sums quantities for same name+unit', () => {
    const result = aggregateIngredients([
      makeSrc({ dishName: 'Pasta', quantity: 200, unit: 'g', name: 'Flour' }),
      makeSrc({ dishName: 'Pizza', quantity: 300, unit: 'g', name: 'Flour' }),
    ]);
    expect(result).toEqual([
      {
        name: 'Flour',
        quantity: 500,
        unit: 'g',
        dishes: ['Pasta', 'Pizza'],
        notes: [],
        inPantry: false,
        category: 'Other',
        stores: [],
      },
    ]);
  });

  it('groups case-insensitively by name and unit', () => {
    const result = aggregateIngredients([
      makeSrc({ dishName: 'A', quantity: 1, unit: 'Cup', name: 'Milk' }),
      makeSrc({ dishName: 'B', quantity: 2, unit: 'cup', name: 'milk' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(3);
  });

  it('sets quantity to null when any contributing ingredient has null quantity', () => {
    const result = aggregateIngredients([
      makeSrc({ dishName: 'A', quantity: 200, unit: 'g', name: 'Flour' }),
      makeSrc({ dishName: 'B', quantity: null, unit: 'g', name: 'Flour' }),
    ]);
    expect(result[0].quantity).toBeNull();
  });

  it('keeps quantity null if both are null', () => {
    const result = aggregateIngredients([
      makeSrc({ dishName: 'A', quantity: null, unit: null, name: 'Salt' }),
      makeSrc({ dishName: 'B', quantity: null, unit: null, name: 'Salt' }),
    ]);
    expect(result[0].quantity).toBeNull();
  });

  it('does not duplicate dish names', () => {
    const result = aggregateIngredients([
      makeSrc({ dishName: 'Pasta', quantity: 100, unit: 'g', name: 'Flour' }),
      makeSrc({ dishName: 'Pasta', quantity: 100, unit: 'g', name: 'Flour' }),
    ]);
    expect(result[0].dishes).toEqual(['Pasta']);
  });

  it('collects unique notes', () => {
    const result = aggregateIngredients([
      makeSrc({ dishName: 'A', quantity: 1, unit: null, name: 'Garlic', notes: 'minced' }),
      makeSrc({ dishName: 'B', quantity: 2, unit: null, name: 'Garlic', notes: 'sliced' }),
      makeSrc({ dishName: 'C', quantity: 1, unit: null, name: 'Garlic', notes: 'minced' }),
    ]);
    expect(result[0].notes).toEqual(['minced', 'sliced']);
  });

  it('ignores null notes', () => {
    const result = aggregateIngredients([
      makeSrc({ dishName: 'A', quantity: 1, unit: null, name: 'Salt', notes: null }),
      makeSrc({ dishName: 'B', quantity: 1, unit: null, name: 'Salt', notes: null }),
    ]);
    expect(result[0].notes).toEqual([]);
  });

  it('treats different units as separate items', () => {
    const result = aggregateIngredients([
      makeSrc({ dishName: 'A', quantity: 1, unit: 'cup', name: 'Milk' }),
      makeSrc({ dishName: 'B', quantity: 200, unit: 'ml', name: 'Milk' }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('sorts results alphabetically by name', () => {
    const result = aggregateIngredients([
      makeSrc({ dishName: 'A', quantity: 1, unit: null, name: 'Zucchini' }),
      makeSrc({ dishName: 'A', quantity: 1, unit: null, name: 'Apple' }),
      makeSrc({ dishName: 'A', quantity: 1, unit: null, name: 'Mango' }),
    ]);
    expect(result.map((r) => r.name)).toEqual(['Apple', 'Mango', 'Zucchini']);
  });

  it('defaults inPantry to false', () => {
    const result = aggregateIngredients([makeSrc({ name: 'Salt' })]);
    expect(result[0].inPantry).toBe(false);
  });

  it('uses category from first source when aggregating', () => {
    const result = aggregateIngredients([
      makeSrc({ name: 'Flour', unit: 'g', category: 'Pantry Staples' }),
      makeSrc({ name: 'Flour', unit: 'g', category: 'Other' }),
    ]);
    expect(result[0].category).toBe('Pantry Staples');
  });

  it('merges stores as union across sources', () => {
    const result = aggregateIngredients([
      makeSrc({ name: 'Flour', unit: 'g', storeNames: ['Aldi', 'Costco'] }),
      makeSrc({ name: 'Flour', unit: 'g', storeNames: ['Costco', 'Whole Foods'] }),
    ]);
    expect(result[0].stores).toHaveLength(3);
    expect(result[0].stores).toContain('Aldi');
    expect(result[0].stores).toContain('Costco');
    expect(result[0].stores).toContain('Whole Foods');
  });

  it('defaults category to Other and stores to [] when not provided', () => {
    const result = aggregateIngredients([makeSrc()]);
    expect(result[0].category).toBe('Other');
    expect(result[0].stores).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getWeekGroceries
// ---------------------------------------------------------------------------

function makeMenu(entries: unknown[] = []) {
  return {
    id: 'menu-1',
    weekStartDate: '2024-01-01',
    entries,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  };
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    date: '2024-01-01',
    type: 'assembled',
    mainDish: null,
    sideDishes: [],
    ...overrides,
  };
}

/** Returns a select().from().where().orderBy() chain resolving to result */
function selFromWhereOrderBy(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue(result) }),
    }),
  };
}

/** Returns a select().from().innerJoin().where() chain resolving to result */
function selFromInnerJoinWhere(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

describe('getWeekGroceries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPantryItems.mockResolvedValue([]);
  });

  it('returns empty groceries when menu has no assembled entries with dishes', async () => {
    mockGetOrCreateWeekMenu.mockResolvedValueOnce(makeMenu([makeEntry({ type: 'fend_for_self' })]));

    const result = await getWeekGroceries('2024-01-01');

    expect(result.groceries).toEqual([]);
    expect(result.weekStartDate).toBe('2024-01-01');
  });

  it('returns empty groceries when assembled entries have no dishes', async () => {
    mockGetOrCreateWeekMenu.mockResolvedValueOnce(
      makeMenu([makeEntry({ type: 'assembled', mainDish: null, sideDishes: [] })])
    );

    const result = await getWeekGroceries('2024-01-01');

    expect(result.groceries).toEqual([]);
  });

  it('fetches ingredients for main dish and aggregates with category/stores', async () => {
    const entry = makeEntry({
      type: 'assembled',
      mainDish: { id: 'dish-1', name: 'Pasta' },
      sideDishes: [],
    });
    mockGetOrCreateWeekMenu.mockResolvedValueOnce(makeMenu([entry]));
    // first select: ingredients
    mockDb.select.mockReturnValueOnce(
      selFromWhereOrderBy([
        {
          id: 'ing-1',
          dishId: 'dish-1',
          name: 'Flour',
          quantity: 200,
          unit: 'g',
          notes: null,
          sortOrder: 0,
          category: 'Pantry Staples',
        },
      ])
    );
    // second select: store rows (none)
    mockDb.select.mockReturnValueOnce(selFromInnerJoinWhere([]));

    const result = await getWeekGroceries('2024-01-01');

    expect(result.groceries).toHaveLength(1);
    expect(result.groceries[0].name).toBe('Flour');
    expect(result.groceries[0].category).toBe('Pantry Staples');
    expect(result.groceries[0].stores).toEqual([]);
    expect(result.groceries[0].inPantry).toBe(false);
  });

  it('includes store names from ingredient_stores join', async () => {
    const entry = makeEntry({
      type: 'assembled',
      mainDish: { id: 'dish-1', name: 'Pasta' },
      sideDishes: [],
    });
    mockGetOrCreateWeekMenu.mockResolvedValueOnce(makeMenu([entry]));
    mockDb.select.mockReturnValueOnce(
      selFromWhereOrderBy([
        {
          id: 'ing-1',
          dishId: 'dish-1',
          name: 'Olive Oil',
          quantity: 1,
          unit: 'tbsp',
          notes: null,
          sortOrder: 0,
          category: 'Pantry Staples',
        },
      ])
    );
    mockDb.select.mockReturnValueOnce(
      selFromInnerJoinWhere([
        { ingredientId: 'ing-1', storeName: 'Trader Joes' },
        { ingredientId: 'ing-1', storeName: 'Whole Foods' },
      ])
    );

    const result = await getWeekGroceries('2024-01-01');

    expect(result.groceries[0].stores).toEqual(['Trader Joes', 'Whole Foods']);
  });

  it('marks items as inPantry when pantry contains matching ingredient', async () => {
    const entry = makeEntry({
      type: 'assembled',
      mainDish: { id: 'dish-1', name: 'Pasta' },
      sideDishes: [],
    });
    mockGetOrCreateWeekMenu.mockResolvedValueOnce(makeMenu([entry]));
    mockDb.select.mockReturnValueOnce(
      selFromWhereOrderBy([
        {
          id: 'ing-1',
          dishId: 'dish-1',
          name: 'Olive Oil',
          quantity: 1,
          unit: 'tbsp',
          notes: null,
          sortOrder: 0,
          category: 'Other',
        },
      ])
    );
    mockDb.select.mockReturnValueOnce(selFromInnerJoinWhere([]));
    mockListPantryItems.mockResolvedValueOnce([
      {
        id: 'p-1',
        ingredientName: 'Olive Oil',
        quantity: 1,
        unit: null,
        expiresAt: null,
        createdAt: '',
      },
    ]);

    const result = await getWeekGroceries('2024-01-01');

    expect(result.groceries[0].inPantry).toBe(true);
  });

  it('fetches ingredients for side dishes', async () => {
    const entry = makeEntry({
      type: 'assembled',
      mainDish: null,
      sideDishes: [{ id: 'dish-2', name: 'Salad' }],
    });
    mockGetOrCreateWeekMenu.mockResolvedValueOnce(makeMenu([entry]));
    mockDb.select.mockReturnValueOnce(
      selFromWhereOrderBy([
        {
          id: 'ing-2',
          dishId: 'dish-2',
          name: 'Lettuce',
          quantity: 1,
          unit: 'head',
          notes: null,
          sortOrder: 0,
          category: 'Produce',
        },
      ])
    );
    mockDb.select.mockReturnValueOnce(selFromInnerJoinWhere([]));

    const result = await getWeekGroceries('2024-01-01');

    expect(result.groceries).toHaveLength(1);
    expect(result.groceries[0].name).toBe('Lettuce');
    expect(result.groceries[0].category).toBe('Produce');
  });

  it('deduplicates dishes across entries', async () => {
    const entries = [
      makeEntry({
        id: 'entry-1',
        type: 'assembled',
        mainDish: { id: 'dish-1', name: 'Pasta' },
        sideDishes: [],
      }),
      makeEntry({
        id: 'entry-2',
        type: 'assembled',
        mainDish: { id: 'dish-1', name: 'Pasta' },
        sideDishes: [],
      }),
    ];
    mockGetOrCreateWeekMenu.mockResolvedValueOnce(makeMenu(entries));
    mockDb.select.mockReturnValueOnce(
      selFromWhereOrderBy([
        {
          id: 'ing-1',
          dishId: 'dish-1',
          name: 'Garlic',
          quantity: 2,
          unit: 'cloves',
          notes: null,
          sortOrder: 0,
          category: 'Produce',
        },
      ])
    );
    mockDb.select.mockReturnValueOnce(selFromInnerJoinWhere([]));

    const result = await getWeekGroceries('2024-01-01');

    expect(result.groceries).toHaveLength(1);
    expect(result.groceries[0].name).toBe('Garlic');
  });
});
