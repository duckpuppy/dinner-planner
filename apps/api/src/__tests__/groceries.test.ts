import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  inArray: vi.fn().mockReturnValue(null),
  asc: vi.fn().mockReturnValue(null),
  sql: vi.fn().mockReturnValue(null),
}));

// Mock db to avoid loading native better-sqlite3 bindings in unit tests
vi.mock('../db/index.js', () => ({
  db: mockDb,
  schema: {
    ingredients: { dishId: null, sortOrder: null },
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

describe('aggregateIngredients', () => {
  it('returns empty array for no inputs', () => {
    expect(aggregateIngredients([])).toEqual([]);
  });

  it('returns single item unchanged', () => {
    const result = aggregateIngredients([
      { dishName: 'Pasta', quantity: 200, unit: 'g', name: 'Flour', notes: null },
    ]);
    expect(result).toEqual([
      { name: 'Flour', quantity: 200, unit: 'g', dishes: ['Pasta'], notes: [], inPantry: false },
    ]);
  });

  it('sums quantities for same name+unit', () => {
    const result = aggregateIngredients([
      { dishName: 'Pasta', quantity: 200, unit: 'g', name: 'Flour', notes: null },
      { dishName: 'Pizza', quantity: 300, unit: 'g', name: 'Flour', notes: null },
    ]);
    expect(result).toEqual([
      {
        name: 'Flour',
        quantity: 500,
        unit: 'g',
        dishes: ['Pasta', 'Pizza'],
        notes: [],
        inPantry: false,
      },
    ]);
  });

  it('groups case-insensitively by name and unit', () => {
    const result = aggregateIngredients([
      { dishName: 'A', quantity: 1, unit: 'Cup', name: 'Milk', notes: null },
      { dishName: 'B', quantity: 2, unit: 'cup', name: 'milk', notes: null },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(3);
  });

  it('sets quantity to null when any contributing ingredient has null quantity', () => {
    const result = aggregateIngredients([
      { dishName: 'A', quantity: 200, unit: 'g', name: 'Flour', notes: null },
      { dishName: 'B', quantity: null, unit: 'g', name: 'Flour', notes: null },
    ]);
    expect(result[0].quantity).toBeNull();
  });

  it('keeps quantity null if both are null', () => {
    const result = aggregateIngredients([
      { dishName: 'A', quantity: null, unit: null, name: 'Salt', notes: null },
      { dishName: 'B', quantity: null, unit: null, name: 'Salt', notes: null },
    ]);
    expect(result[0].quantity).toBeNull();
  });

  it('does not duplicate dish names', () => {
    const result = aggregateIngredients([
      { dishName: 'Pasta', quantity: 100, unit: 'g', name: 'Flour', notes: null },
      { dishName: 'Pasta', quantity: 100, unit: 'g', name: 'Flour', notes: null },
    ]);
    expect(result[0].dishes).toEqual(['Pasta']);
  });

  it('collects unique notes', () => {
    const result = aggregateIngredients([
      { dishName: 'A', quantity: 1, unit: null, name: 'Garlic', notes: 'minced' },
      { dishName: 'B', quantity: 2, unit: null, name: 'Garlic', notes: 'sliced' },
      { dishName: 'C', quantity: 1, unit: null, name: 'Garlic', notes: 'minced' },
    ]);
    expect(result[0].notes).toEqual(['minced', 'sliced']);
  });

  it('ignores null notes', () => {
    const result = aggregateIngredients([
      { dishName: 'A', quantity: 1, unit: null, name: 'Salt', notes: null },
      { dishName: 'B', quantity: 1, unit: null, name: 'Salt', notes: null },
    ]);
    expect(result[0].notes).toEqual([]);
  });

  it('treats different units as separate items', () => {
    const result = aggregateIngredients([
      { dishName: 'A', quantity: 1, unit: 'cup', name: 'Milk', notes: null },
      { dishName: 'B', quantity: 200, unit: 'ml', name: 'Milk', notes: null },
    ]);
    expect(result).toHaveLength(2);
  });

  it('sorts results alphabetically by name', () => {
    const result = aggregateIngredients([
      { dishName: 'A', quantity: 1, unit: null, name: 'Zucchini', notes: null },
      { dishName: 'A', quantity: 1, unit: null, name: 'Apple', notes: null },
      { dishName: 'A', quantity: 1, unit: null, name: 'Mango', notes: null },
    ]);
    expect(result.map((r) => r.name)).toEqual(['Apple', 'Mango', 'Zucchini']);
  });

  it('defaults inPantry to false', () => {
    const result = aggregateIngredients([
      { dishName: 'A', quantity: 1, unit: null, name: 'Salt', notes: null },
    ]);
    expect(result[0].inPantry).toBe(false);
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

function selFromWhereOrderBy(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({ orderBy: vi.fn().mockResolvedValue(result) }),
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

  it('fetches ingredients for main dish and aggregates', async () => {
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
          name: 'Flour',
          quantity: 200,
          unit: 'g',
          notes: null,
          sortOrder: 0,
        },
      ])
    );

    const result = await getWeekGroceries('2024-01-01');

    expect(result.groceries).toHaveLength(1);
    expect(result.groceries[0].name).toBe('Flour');
    expect(result.groceries[0].inPantry).toBe(false);
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
        },
      ])
    );

    const result = await getWeekGroceries('2024-01-01');

    expect(result.groceries).toHaveLength(1);
    expect(result.groceries[0].name).toBe('Lettuce');
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
        },
      ])
    );
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
        },
      ])
    );

    const result = await getWeekGroceries('2024-01-01');

    // dish-1 appears twice but ingredients are fetched once (Map deduplication)
    expect(result.groceries).toHaveLength(1);
    expect(result.groceries[0].name).toBe('Garlic');
  });
});
