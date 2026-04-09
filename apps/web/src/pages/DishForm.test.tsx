import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DishForm, DishDetail } from './DishesPage';
import type { Dish } from '@/lib/api';

// Mock the api module
vi.mock('@/lib/api', () => ({
  dishes: {
    create: vi.fn(),
    update: vi.fn(),
    get: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
    hardDelete: vi.fn(),
    getPreparations: vi.fn(),
  },
  ratings: {
    getDishStats: vi.fn(),
  },
  stores: {
    list: vi.fn().mockResolvedValue([]),
  },
  DIETARY_TAGS: [
    'vegetarian',
    'vegan',
    'gluten_free',
    'dairy_free',
    'nut_free',
    'low_carb',
    'low_calorie',
  ] as const,
}));

// Mock auth store
vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn((selector) =>
    selector({
      user: {
        id: 'user-1',
        role: 'member',
        username: 'test',
        displayName: 'Test',
        theme: 'light',
        homeView: 'today',
      },
    })
  ),
}));

// Mock DishNotes component
vi.mock('@/components/DishNotes', () => ({
  DishNotes: () => null,
}));

import { dishes as dishesApi, ratings as ratingsApi } from '@/lib/api';

const mockDish: Dish = {
  id: 'dish-1',
  name: 'Spaghetti Bolognese',
  description: 'Classic pasta dish',
  type: 'main',
  instructions: 'Cook the pasta.',
  prepTime: 15,
  cookTime: 45,
  servings: 4,
  calories: 450,
  proteinG: 25,
  carbsG: 60,
  fatG: 12,
  sourceUrl: null,
  videoUrl: null,
  archived: false,
  createdById: 'user-1',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  tags: ['italian'],
  dietaryTags: ['vegetarian'],
  ingredients: [
    {
      id: 'ing-1',
      quantity: 2,
      unit: 'cups',
      name: 'flour',
      notes: null,
      sortOrder: 0,
      category: 'Other',
      stores: [],
    },
    {
      id: 'ing-2',
      quantity: null,
      unit: null,
      name: 'salt',
      notes: 'to taste',
      sortOrder: 1,
      category: 'Other',
      stores: [],
    },
  ],
};

const mockDishNoNutrition: Dish = {
  ...mockDish,
  id: 'dish-2',
  calories: null,
  proteinG: null,
  carbsG: null,
  fatG: null,
};

const mockDishWithDietaryTags: Dish = {
  ...mockDish,
  id: 'dish-3',
  dietaryTags: ['vegetarian', 'gluten_free'],
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(dishesApi.create).mockResolvedValue({} as Dish);
  vi.mocked(dishesApi.update).mockResolvedValue({} as Dish);
  vi.mocked(dishesApi.get).mockResolvedValue({ dish: mockDish });
  vi.mocked(dishesApi.getPreparations).mockResolvedValue({ preparations: [] });
  vi.mocked(ratingsApi.getDishStats).mockResolvedValue({ stats: null });
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
          ingredients: expect.arrayContaining([
            expect.objectContaining({ quantity: 2, unit: 'cups', name: 'flour', notes: null }),
            expect.objectContaining({
              quantity: null,
              unit: null,
              name: 'salt',
              notes: 'to taste',
            }),
          ]),
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
          ingredients: expect.arrayContaining([
            expect.objectContaining({ quantity: null, unit: null, name: 'garlic', notes: null }),
          ]),
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

describe('DishForm - nutrition fields', () => {
  it('renders nutrition inputs', () => {
    render(<DishForm onClose={vi.fn()} />, { wrapper });

    expect(screen.getByLabelText('Calories')).toBeDefined();
    expect(screen.getByLabelText('Protein')).toBeDefined();
    expect(screen.getByLabelText('Carbs')).toBeDefined();
    expect(screen.getByLabelText('Fat')).toBeDefined();
  });

  it('pre-populates nutrition inputs when editing an existing dish', () => {
    render(<DishForm dish={mockDish} onClose={vi.fn()} />, { wrapper });

    expect(screen.getByLabelText('Calories')).toHaveProperty('value', '450');
    expect(screen.getByLabelText('Protein')).toHaveProperty('value', '25');
    expect(screen.getByLabelText('Carbs')).toHaveProperty('value', '60');
    expect(screen.getByLabelText('Fat')).toHaveProperty('value', '12');
  });

  it('leaves nutrition inputs empty for a new dish', () => {
    render(<DishForm onClose={vi.fn()} />, { wrapper });

    expect(screen.getByLabelText('Calories')).toHaveProperty('value', '');
    expect(screen.getByLabelText('Protein')).toHaveProperty('value', '');
    expect(screen.getByLabelText('Carbs')).toHaveProperty('value', '');
    expect(screen.getByLabelText('Fat')).toHaveProperty('value', '');
  });

  it('submits nutrition values in the create payload', async () => {
    render(<DishForm onClose={vi.fn()} />, { wrapper });

    fireEvent.change(screen.getByPlaceholderText('Dish name'), { target: { value: 'Test Dish' } });
    fireEvent.change(screen.getByLabelText('Calories'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Protein'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Carbs'), { target: { value: '55' } });
    fireEvent.change(screen.getByLabelText('Fat'), { target: { value: '15' } });

    fireEvent.submit(screen.getByRole('button', { name: /create dish/i }).closest('form')!);

    await waitFor(() => {
      expect(dishesApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          calories: 500,
          proteinG: 30,
          carbsG: 55,
          fatG: 15,
        })
      );
    });
  });

  it('submits null for empty nutrition inputs', async () => {
    render(<DishForm onClose={vi.fn()} />, { wrapper });

    fireEvent.change(screen.getByPlaceholderText('Dish name'), { target: { value: 'Test Dish' } });
    fireEvent.submit(screen.getByRole('button', { name: /create dish/i }).closest('form')!);

    await waitFor(() => {
      expect(dishesApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          calories: null,
          proteinG: null,
          carbsG: null,
          fatG: null,
        })
      );
    });
  });
});

describe('DishForm - dietary tags', () => {
  it('renders all dietary tag checkboxes', () => {
    render(<DishForm onClose={vi.fn()} />, { wrapper });

    expect(screen.getByLabelText('Vegetarian')).toBeDefined();
    expect(screen.getByLabelText('Vegan')).toBeDefined();
    expect(screen.getByLabelText('Gluten-Free')).toBeDefined();
    expect(screen.getByLabelText('Dairy-Free')).toBeDefined();
    expect(screen.getByLabelText('Nut-Free')).toBeDefined();
    expect(screen.getByLabelText('Low-Carb')).toBeDefined();
    expect(screen.getByLabelText('Low-Calorie')).toBeDefined();
  });

  it('initializes dietary tag checkboxes from existing dish', () => {
    render(<DishForm dish={mockDish} onClose={vi.fn()} />, { wrapper });

    const vegetarianCb = screen.getByLabelText('Vegetarian') as HTMLInputElement;
    const veganCb = screen.getByLabelText('Vegan') as HTMLInputElement;

    expect(vegetarianCb.checked).toBe(true);
    expect(veganCb.checked).toBe(false);
  });

  it('toggles dietary tag checkbox on click', () => {
    render(<DishForm onClose={vi.fn()} />, { wrapper });

    const veganCb = screen.getByLabelText('Vegan') as HTMLInputElement;
    expect(veganCb.checked).toBe(false);

    fireEvent.click(veganCb);
    expect(veganCb.checked).toBe(true);

    fireEvent.click(veganCb);
    expect(veganCb.checked).toBe(false);
  });

  it('includes dietaryTags in create payload', async () => {
    render(<DishForm onClose={vi.fn()} />, { wrapper });

    fireEvent.change(screen.getByPlaceholderText('Dish name'), { target: { value: 'Test Dish' } });
    fireEvent.click(screen.getByLabelText('Vegan'));
    fireEvent.click(screen.getByLabelText('Gluten-Free'));

    fireEvent.submit(screen.getByRole('button', { name: /create dish/i }).closest('form')!);

    await waitFor(() => {
      expect(dishesApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          dietaryTags: ['vegan', 'gluten_free'],
        })
      );
    });
  });

  it('includes existing dietaryTags in update payload', async () => {
    render(<DishForm dish={mockDish} onClose={vi.fn()} />, { wrapper });

    fireEvent.submit(screen.getByRole('button', { name: /save changes/i }).closest('form')!);

    await waitFor(() => {
      expect(dishesApi.update).toHaveBeenCalledWith(
        'dish-1',
        expect.objectContaining({
          dietaryTags: ['vegetarian'],
        })
      );
    });
  });
});

describe('DishDetail - dietary tag badges', () => {
  it('shows dietary tag badges when dish has dietary tags', () => {
    render(<DishDetail dish={mockDish} onBack={vi.fn()} />, { wrapper });

    expect(screen.getByText('Vegetarian')).toBeDefined();
  });

  it('shows multiple dietary tag badges', () => {
    render(<DishDetail dish={mockDishWithDietaryTags} onBack={vi.fn()} />, { wrapper });

    expect(screen.getByText('Vegetarian')).toBeDefined();
    expect(screen.getByText('Gluten-Free')).toBeDefined();
  });

  it('shows no dietary tag badges when dish has no dietary tags', () => {
    const dishNoDietaryTags = { ...mockDish, dietaryTags: [] };
    render(<DishDetail dish={dishNoDietaryTags} onBack={vi.fn()} />, { wrapper });

    expect(screen.queryByText('Vegetarian')).toBeNull();
    expect(screen.queryByText('Vegan')).toBeNull();
  });
});

describe('DishDetail - nutrition display', () => {
  it('shows nutrition section when dish has nutrition data', () => {
    render(<DishDetail dish={mockDish} onBack={vi.fn()} />, { wrapper });

    expect(screen.getByText(/nutrition/i)).toBeDefined();
    expect(screen.getByText(/450 kcal/i)).toBeDefined();
    expect(screen.getByText(/25 g/i)).toBeDefined();
  });

  it('hides nutrition section when all nutrition fields are null', () => {
    render(<DishDetail dish={mockDishNoNutrition} onBack={vi.fn()} />, { wrapper });

    expect(screen.queryByText(/nutrition/i)).toBeNull();
  });

  it('scales nutrition values when serving count is changed', async () => {
    render(<DishDetail dish={mockDish} onBack={vi.fn()} />, { wrapper });

    // Default: 4 servings, calories = 450
    expect(screen.getByText(/450 kcal/i)).toBeDefined();

    // Increase to 8 servings (2x scale)
    const increaseBtn = screen.getByRole('button', { name: /increase servings/i });
    fireEvent.click(increaseBtn);
    fireEvent.click(increaseBtn);
    fireEvent.click(increaseBtn);
    fireEvent.click(increaseBtn);

    // 450 * (8/4) = 900
    expect(screen.getByText(/900 kcal/i)).toBeDefined();
  });
});
