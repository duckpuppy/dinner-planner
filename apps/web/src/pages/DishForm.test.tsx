import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DishForm } from './DishesPage';
import type { Dish } from '@/lib/api';

// Mock the api module
vi.mock('@/lib/api', () => ({
  dishes: {
    create: vi.fn(),
    update: vi.fn(),
  },
}));

import { dishes as dishesApi } from '@/lib/api';

const mockDish: Dish = {
  id: 'dish-1',
  name: 'Spaghetti Bolognese',
  description: 'Classic pasta dish',
  type: 'main',
  instructions: 'Cook the pasta.',
  prepTime: 15,
  cookTime: 45,
  servings: 4,
  sourceUrl: null,
  videoUrl: null,
  archived: false,
  createdById: 'user-1',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  tags: ['italian'],
  ingredients: [
    { id: 'ing-1', quantity: 2, unit: 'cups', name: 'flour', notes: null, sortOrder: 0 },
    { id: 'ing-2', quantity: null, unit: null, name: 'salt', notes: 'to taste', sortOrder: 1 },
  ],
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.mocked(dishesApi.create).mockResolvedValue({} as Dish);
  vi.mocked(dishesApi.update).mockResolvedValue({} as Dish);
});

afterEach(() => {
  cleanup();
});

describe('DishForm - ingredient editor', () => {
  it('renders existing ingredients when editing', () => {
    render(<DishForm dish={mockDish} onClose={vi.fn()} />, { wrapper });

    expect(screen.getByDisplayValue('flour')).toBeDefined();
    expect(screen.getByDisplayValue('salt')).toBeDefined();
    expect(screen.getByDisplayValue('to taste')).toBeDefined();
  });

  it('populates quantity and unit from existing ingredients', () => {
    render(<DishForm dish={mockDish} onClose={vi.fn()} />, { wrapper });

    const quantityInputs = screen.getAllByLabelText('Quantity');
    const unitInputs = screen.getAllByLabelText('Unit');

    expect(quantityInputs[0]).toHaveProperty('value', '2');
    expect(unitInputs[0]).toHaveProperty('value', 'cups');
    expect(quantityInputs[1]).toHaveProperty('value', '');
    expect(unitInputs[1]).toHaveProperty('value', '');
  });

  it('adds a new ingredient row when "Add ingredient" is clicked', () => {
    render(<DishForm dish={mockDish} onClose={vi.fn()} />, { wrapper });

    const addBtn = screen.getByRole('button', { name: /add ingredient/i });
    fireEvent.click(addBtn);

    const nameInputs = screen.getAllByLabelText('Ingredient name');
    expect(nameInputs).toHaveLength(3); // 2 existing + 1 new
  });

  it('starts with no rows for a new dish', () => {
    render(<DishForm onClose={vi.fn()} />, { wrapper });

    const nameInputs = screen.queryAllByLabelText('Ingredient name');
    expect(nameInputs).toHaveLength(0);
  });

  it('removes a row when remove button is clicked', () => {
    render(<DishForm dish={mockDish} onClose={vi.fn()} />, { wrapper });

    const removeButtons = screen.getAllByRole('button', { name: /remove ingredient/i });
    fireEvent.click(removeButtons[0]);

    const nameInputs = screen.getAllByLabelText('Ingredient name');
    expect(nameInputs).toHaveLength(1);
    expect(screen.getByDisplayValue('salt')).toBeDefined();
    expect(screen.queryByDisplayValue('flour')).toBeNull();
  });

  it('moves ingredient up when move up is clicked', () => {
    render(<DishForm dish={mockDish} onClose={vi.fn()} />, { wrapper });

    const upButtons = screen.getAllByRole('button', { name: /move up/i });
    // Click "move up" on second row (index 1) → should become first
    fireEvent.click(upButtons[1]);

    const nameInputs = screen.getAllByLabelText('Ingredient name');
    expect(nameInputs[0]).toHaveProperty('value', 'salt');
    expect(nameInputs[1]).toHaveProperty('value', 'flour');
  });

  it('moves ingredient down when move down is clicked', () => {
    render(<DishForm dish={mockDish} onClose={vi.fn()} />, { wrapper });

    const downButtons = screen.getAllByRole('button', { name: /move down/i });
    // Click "move down" on first row (index 0) → should become second
    fireEvent.click(downButtons[0]);

    const nameInputs = screen.getAllByLabelText('Ingredient name');
    expect(nameInputs[0]).toHaveProperty('value', 'salt');
    expect(nameInputs[1]).toHaveProperty('value', 'flour');
  });

  it('disables move-up for first row and move-down for last row', () => {
    render(<DishForm dish={mockDish} onClose={vi.fn()} />, { wrapper });

    const upButtons = screen.getAllByRole('button', { name: /move up/i });
    const downButtons = screen.getAllByRole('button', { name: /move down/i });

    expect(upButtons[0]).toBeDisabled();
    expect(upButtons[1]).not.toBeDisabled();
    expect(downButtons[0]).not.toBeDisabled();
    expect(downButtons[1]).toBeDisabled();
  });

  it('submits correct structured ingredient data', async () => {
    render(<DishForm dish={mockDish} onClose={vi.fn()} />, { wrapper });

    fireEvent.submit(screen.getByRole('button', { name: /save changes/i }).closest('form')!);

    await waitFor(() => {
      expect(dishesApi.update).toHaveBeenCalledWith(
        'dish-1',
        expect.objectContaining({
          ingredients: [
            { quantity: 2, unit: 'cups', name: 'flour', notes: null },
            { quantity: null, unit: null, name: 'salt', notes: 'to taste' },
          ],
          tags: ['italian'],
        })
      );
    });
  });

  it('filters out rows with empty names on submit', async () => {
    render(<DishForm onClose={vi.fn()} />, { wrapper });

    // Add two rows but only fill in one
    const addBtn = screen.getByRole('button', { name: /add ingredient/i });
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);

    const nameInputs = screen.getAllByLabelText('Ingredient name');
    fireEvent.change(nameInputs[0], { target: { value: 'garlic' } });
    // Second row stays empty

    // Fill required name field
    fireEvent.change(screen.getByPlaceholderText('Dish name'), { target: { value: 'Test Dish' } });
    fireEvent.submit(screen.getByRole('button', { name: /create dish/i }).closest('form')!);

    await waitFor(() => {
      expect(dishesApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredients: [{ quantity: null, unit: null, name: 'garlic', notes: null }],
        })
      );
    });
  });
});

describe('DishForm - tag chip editor', () => {
  it('renders existing tags as chips', () => {
    render(<DishForm dish={mockDish} onClose={vi.fn()} />, { wrapper });

    expect(screen.getByText('italian')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Remove tag italian' })).toBeDefined();
  });

  it('starts with no chips for a new dish', () => {
    render(<DishForm onClose={vi.fn()} />, { wrapper });

    expect(screen.queryByRole('button', { name: /remove tag/i })).toBeNull();
  });

  it('adds a tag on Enter key', () => {
    render(<DishForm onClose={vi.fn()} />, { wrapper });

    const tagInput = screen.getByLabelText('Add tag');
    fireEvent.change(tagInput, { target: { value: 'vegan' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });

    expect(screen.getByText('vegan')).toBeDefined();
    expect((tagInput as HTMLInputElement).value).toBe('');
  });

  it('adds a tag on comma key', () => {
    render(<DishForm onClose={vi.fn()} />, { wrapper });

    const tagInput = screen.getByLabelText('Add tag');
    fireEvent.change(tagInput, { target: { value: 'quick' } });
    fireEvent.keyDown(tagInput, { key: ',' });

    expect(screen.getByText('quick')).toBeDefined();
  });

  it('removes a tag when its X button is clicked', () => {
    render(<DishForm dish={mockDish} onClose={vi.fn()} />, { wrapper });

    fireEvent.click(screen.getByRole('button', { name: 'Remove tag italian' }));

    expect(screen.queryByText('italian')).toBeNull();
  });

  it('removes last tag on Backspace when input is empty', () => {
    render(<DishForm dish={mockDish} onClose={vi.fn()} />, { wrapper });

    const tagInput = screen.getByLabelText('Add tag');
    fireEvent.keyDown(tagInput, { key: 'Backspace' });

    expect(screen.queryByText('italian')).toBeNull();
  });

  it('does not add duplicate tags', () => {
    render(<DishForm dish={mockDish} onClose={vi.fn()} />, { wrapper });

    const tagInput = screen.getByLabelText('Add tag');
    fireEvent.change(tagInput, { target: { value: 'italian' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });

    // Should still only have one "italian" chip
    expect(screen.getAllByText('italian')).toHaveLength(1);
  });

  it('normalizes tags to lowercase', () => {
    render(<DishForm onClose={vi.fn()} />, { wrapper });

    const tagInput = screen.getByLabelText('Add tag');
    fireEvent.change(tagInput, { target: { value: 'Italian' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });

    expect(screen.getByText('italian')).toBeDefined();
    expect(screen.queryByText('Italian')).toBeNull();
  });

  it('submits tags array on save', async () => {
    render(<DishForm onClose={vi.fn()} />, { wrapper });

    const tagInput = screen.getByLabelText('Add tag');
    fireEvent.change(tagInput, { target: { value: 'pasta' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });

    fireEvent.change(screen.getByPlaceholderText('Dish name'), { target: { value: 'Test Dish' } });
    fireEvent.submit(screen.getByRole('button', { name: /create dish/i }).closest('form')!);

    await waitFor(() => {
      expect(dishesApi.create).toHaveBeenCalledWith(expect.objectContaining({ tags: ['pasta'] }));
    });
  });
});
