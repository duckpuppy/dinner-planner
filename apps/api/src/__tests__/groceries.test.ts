import { describe, it, expect, vi } from 'vitest';

// Mock db to avoid loading native better-sqlite3 bindings in unit tests
vi.mock('../db/index.js', () => ({ db: {}, schema: {} }));

import { aggregateIngredients } from '../services/groceries.js';

describe('aggregateIngredients', () => {
  it('returns empty array for no inputs', () => {
    expect(aggregateIngredients([])).toEqual([]);
  });

  it('returns single item unchanged', () => {
    const result = aggregateIngredients([
      { dishName: 'Pasta', quantity: 200, unit: 'g', name: 'Flour', notes: null },
    ]);
    expect(result).toEqual([
      { name: 'Flour', quantity: 200, unit: 'g', dishes: ['Pasta'], notes: [] },
    ]);
  });

  it('sums quantities for same name+unit', () => {
    const result = aggregateIngredients([
      { dishName: 'Pasta', quantity: 200, unit: 'g', name: 'Flour', notes: null },
      { dishName: 'Pizza', quantity: 300, unit: 'g', name: 'Flour', notes: null },
    ]);
    expect(result).toEqual([
      { name: 'Flour', quantity: 500, unit: 'g', dishes: ['Pasta', 'Pizza'], notes: [] },
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
});
