import { describe, it, expect } from 'vitest';
import { inferCategory } from '../services/categoryHeuristics.js';

describe('inferCategory', () => {
  it('returns Meat for chicken', () => {
    expect(inferCategory('chicken breast')).toBe('Meat');
  });

  it('returns Meat for ground beef', () => {
    expect(inferCategory('ground beef')).toBe('Meat');
  });

  it('returns Dairy for milk', () => {
    expect(inferCategory('whole milk')).toBe('Dairy');
  });

  it('returns Dairy for shredded cheddar', () => {
    expect(inferCategory('shredded cheddar')).toBe('Dairy');
  });

  it('returns Produce for spinach', () => {
    expect(inferCategory('fresh spinach')).toBe('Produce');
  });

  it('returns Produce for garlic', () => {
    expect(inferCategory('garlic cloves')).toBe('Produce');
  });

  it('returns Seafood for salmon', () => {
    expect(inferCategory('salmon fillet')).toBe('Seafood');
  });

  it('returns Seafood for shrimp', () => {
    expect(inferCategory('large shrimp')).toBe('Seafood');
  });

  it('returns Bakery for bread', () => {
    expect(inferCategory('sourdough bread')).toBe('Bakery');
  });

  it('returns Bakery for tortilla', () => {
    expect(inferCategory('flour tortilla')).toBe('Bakery');
  });

  it('returns Frozen for plain frozen (no other keyword match)', () => {
    expect(inferCategory('frozen edamame')).toBe('Frozen');
  });

  it('returns Produce for frozen peas (pea matches Produce before Frozen)', () => {
    expect(inferCategory('frozen peas')).toBe('Produce');
  });

  it('returns Beverages for broth', () => {
    expect(inferCategory('vegetable broth')).toBe('Beverages');
  });

  it('returns Pantry Staples for pasta', () => {
    expect(inferCategory('penne pasta')).toBe('Pantry Staples');
  });

  it('returns Pantry Staples for olive oil', () => {
    expect(inferCategory('olive oil')).toBe('Pantry Staples');
  });

  it('returns Household for aluminum foil', () => {
    expect(inferCategory('aluminum foil')).toBe('Household');
  });

  it('returns Other for unrecognized ingredient', () => {
    expect(inferCategory('xylitol crystals')).toBe('Other');
  });

  it('is case-insensitive', () => {
    expect(inferCategory('CHICKEN THIGHS')).toBe('Meat');
    expect(inferCategory('Whole Milk')).toBe('Dairy');
    expect(inferCategory('FROZEN EDAMAME')).toBe('Frozen');
  });

  it('first rule wins when multiple keywords could match', () => {
    // "frozen chicken" — Meat rule matches "chicken" before Frozen matches "frozen"
    expect(inferCategory('frozen chicken')).toBe('Meat');
  });

  it('matches substring within longer name', () => {
    expect(inferCategory('roma tomatoes')).toBe('Produce');
    expect(inferCategory('unsalted butter')).toBe('Dairy');
  });
});
