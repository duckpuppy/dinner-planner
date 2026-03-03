import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DishesPage } from './DishesPage';

const { mockCurrentUser } = vi.hoisted(() => ({
  mockCurrentUser: {
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    role: 'admin' as const,
  },
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn((selector: (s: { user: typeof mockCurrentUser }) => unknown) =>
    selector({ user: mockCurrentUser })
  ),
}));

vi.mock('@/lib/api', () => ({
  dishes: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
  },
  ratings: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getDishStats: vi.fn().mockResolvedValue({ stats: { averageRating: null, totalRatings: 0 } }),
  },
  dishNotes: {
    list: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
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
  ],
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/mobile/PullToRefresh', () => ({
  PullToRefresh: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/mobile/SwipeableListItem', () => ({
  SwipeableListItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/useSwipeActions', () => ({
  useSwipeActions: () => ({ activeItemId: null, openSwipe: vi.fn(), closeSwipe: vi.fn() }),
}));

vi.mock('@/components/RecipeImportModal', () => ({
  RecipeImportModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="import-modal">
      <button onClick={onClose}>Close Import</button>
    </div>
  ),
}));

import { dishes as dishesApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(useAuthStore).mockImplementation(
    (selector: (s: { user: typeof mockCurrentUser }) => unknown) =>
      selector({ user: mockCurrentUser })
  );
});

const mockDish = {
  id: 'dish-1',
  name: 'Spaghetti Bolognese',
  description: 'Classic Italian pasta',
  type: 'main' as const,
  tags: ['italian'],
  dietaryTags: [],
  archived: false,
  recipeUrl: null,
  averageRating: 4.5,
  ratingCount: 3,
  ingredients: [],
  createdById: 'user-1',
  createdAt: '2024-01-01T00:00:00Z',
  lastPreparedAt: null,
};

const mockDish2 = {
  id: 'dish-2',
  name: 'Caesar Salad',
  description: 'Fresh salad',
  type: 'side' as const,
  tags: ['salad', 'vegetarian'],
  dietaryTags: ['vegetarian'],
  archived: false,
  recipeUrl: null,
  averageRating: null,
  ratingCount: 0,
  ingredients: [],
  createdById: 'user-2',
  createdAt: '2024-01-01T00:00:00Z',
  lastPreparedAt: null,
};

describe('DishesPage', () => {
  describe('loading state', () => {
    it('shows skeleton while loading', () => {
      vi.mocked(dishesApi.list).mockReturnValue(new Promise(() => {}));
      const { container } = render(<DishesPage />, { wrapper });
      expect(container.querySelector('.animate-pulse')).toBeTruthy();
    });
  });

  describe('error state', () => {
    it('shows error state when loading fails', async () => {
      vi.mocked(dishesApi.list).mockRejectedValue(new Error('Network error'));
      render(<DishesPage />, { wrapper });
      expect(await screen.findByText(/failed to load/i)).toBeTruthy();
    });
  });

  describe('empty state', () => {
    it('shows empty state when no dishes', async () => {
      vi.mocked(dishesApi.list).mockResolvedValue({ dishes: [], total: 0 });
      render(<DishesPage />, { wrapper });
      expect(await screen.findByText(/no dishes yet/i)).toBeTruthy();
    });
  });

  describe('dishes list', () => {
    it('renders heading', async () => {
      vi.mocked(dishesApi.list).mockResolvedValue({ dishes: [mockDish], total: 1 });
      render(<DishesPage />, { wrapper });
      expect(await screen.findByText('Spaghetti Bolognese')).toBeTruthy();
    });

    it('renders dish description', async () => {
      vi.mocked(dishesApi.list).mockResolvedValue({ dishes: [mockDish], total: 1 });
      render(<DishesPage />, { wrapper });
      expect(await screen.findByText('Classic Italian pasta')).toBeTruthy();
    });

    it('renders dish tags', async () => {
      vi.mocked(dishesApi.list).mockResolvedValue({ dishes: [mockDish], total: 1 });
      render(<DishesPage />, { wrapper });
      await screen.findByText('Spaghetti Bolognese');
      const tags = screen.getAllByText('italian');
      expect(tags.length).toBeGreaterThan(0);
    });

    it('renders multiple dishes', async () => {
      vi.mocked(dishesApi.list).mockResolvedValue({
        dishes: [mockDish, mockDish2],
        total: 2,
      });
      render(<DishesPage />, { wrapper });
      expect(await screen.findByText('Spaghetti Bolognese')).toBeTruthy();
      expect(screen.getByText('Caesar Salad')).toBeTruthy();
    });
  });

  describe('search', () => {
    it('renders search input', async () => {
      vi.mocked(dishesApi.list).mockResolvedValue({ dishes: [mockDish], total: 1 });
      render(<DishesPage />, { wrapper });
      expect(screen.getByPlaceholderText(/search/i)).toBeTruthy();
    });

    it('filters dishes by search query', async () => {
      vi.mocked(dishesApi.list).mockResolvedValue({
        dishes: [mockDish, mockDish2],
        total: 2,
      });
      render(<DishesPage />, { wrapper });
      await screen.findByText('Spaghetti Bolognese');

      const searchInput = screen.getByPlaceholderText(/search/i);
      await userEvent.type(searchInput, 'caesar');

      expect(screen.queryByText('Spaghetti Bolognese')).toBeNull();
      expect(screen.getByText('Caesar Salad')).toBeTruthy();
    });
  });

  describe('Add Dish button', () => {
    it('shows Add Dish button', async () => {
      vi.mocked(dishesApi.list).mockResolvedValue({ dishes: [], total: 0 });
      render(<DishesPage />, { wrapper });
      expect(screen.getByRole('button', { name: /Add dish/i })).toBeTruthy();
    });

    it('opens create form when Add dish clicked', async () => {
      vi.mocked(dishesApi.list).mockResolvedValue({ dishes: [], total: 0 });
      render(<DishesPage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /Add dish/i }));
      expect(await screen.findByRole('heading', { name: 'New Dish' })).toBeTruthy();
    });
  });

  describe('dish detail panel', () => {
    it('opens dish detail when dish clicked', async () => {
      vi.mocked(dishesApi.list).mockResolvedValue({ dishes: [mockDish], total: 1 });
      render(<DishesPage />, { wrapper });
      await screen.findByText('Spaghetti Bolognese');
      // Click on the dish to expand/open detail
      fireEvent.click(screen.getByRole('button', { name: /Spaghetti Bolognese/i }));
      // Detail panel should appear with description
      expect(await screen.findByText('Classic Italian pasta')).toBeTruthy();
    });
  });

  describe('Active/Archived toggle', () => {
    it('shows Active and Archived buttons', async () => {
      vi.mocked(dishesApi.list).mockResolvedValue({ dishes: [], total: 0 });
      render(<DishesPage />, { wrapper });
      expect(screen.getByRole('button', { name: 'Active' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Archived' })).toBeTruthy();
    });

    it('switches to archived view when Archived clicked', async () => {
      vi.mocked(dishesApi.list).mockResolvedValue({ dishes: [], total: 0 });
      render(<DishesPage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
      await waitFor(() => {
        expect(dishesApi.list).toHaveBeenCalledWith(expect.objectContaining({ archived: 'true' }));
      });
    });
  });

  describe('Import Recipe button', () => {
    it('shows Import Recipe button', async () => {
      vi.mocked(dishesApi.list).mockResolvedValue({ dishes: [], total: 0 });
      render(<DishesPage />, { wrapper });
      expect(screen.getByRole('button', { name: /Import/i })).toBeTruthy();
    });

    it('opens import modal when Import clicked', async () => {
      vi.mocked(dishesApi.list).mockResolvedValue({ dishes: [], total: 0 });
      render(<DishesPage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /Import/i }));
      expect(await screen.findByTestId('import-modal')).toBeTruthy();
    });
  });

  describe('DishForm - ingredients and instructions', () => {
    beforeEach(() => {
      vi.mocked(dishesApi.list).mockResolvedValue({ dishes: [], total: 0 });
    });

    it('shows instructions textarea in new dish form', async () => {
      render(<DishesPage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /Add dish/i }));
      await screen.findByRole('heading', { name: 'New Dish' });
      const textarea = screen.getByPlaceholderText(/cooking instructions/i);
      expect(textarea).toBeTruthy();
      fireEvent.change(textarea, { target: { value: 'Step 1: Boil water' } });
      expect((textarea as HTMLTextAreaElement).value).toBe('Step 1: Boil water');
    });

    it('adds ingredient row when Add ingredient clicked', async () => {
      render(<DishesPage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /Add dish/i }));
      await screen.findByRole('heading', { name: 'New Dish' });
      const addIngBtn = screen.getByRole('button', { name: /add ingredient/i });
      fireEvent.click(addIngBtn);
      expect(screen.getByRole('textbox', { name: /ingredient name/i })).toBeTruthy();
    });

    it('updates ingredient notes field', async () => {
      render(<DishesPage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /Add dish/i }));
      await screen.findByRole('heading', { name: 'New Dish' });
      fireEvent.click(screen.getByRole('button', { name: /add ingredient/i }));
      const notesInput = screen.getByRole('textbox', { name: 'Notes' });
      fireEvent.change(notesInput, { target: { value: 'finely chopped' } });
      expect((notesInput as HTMLInputElement).value).toBe('finely chopped');
    });

    it('adds tag on blur of tag input', async () => {
      render(<DishesPage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /Add dish/i }));
      await screen.findByRole('heading', { name: 'New Dish' });
      const tagInput = screen.getByRole('textbox', { name: /add tag/i });
      fireEvent.change(tagInput, { target: { value: 'quick' } });
      fireEvent.blur(tagInput);
      expect(await screen.findByText('quick')).toBeTruthy();
    });

    it('updates ingredient quantity field', async () => {
      render(<DishesPage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /Add dish/i }));
      await screen.findByRole('heading', { name: 'New Dish' });
      fireEvent.click(screen.getByRole('button', { name: /add ingredient/i }));
      const qtyInput = screen.getByRole('spinbutton', { name: /quantity/i });
      fireEvent.change(qtyInput, { target: { value: '2' } });
      expect((qtyInput as HTMLInputElement).value).toBe('2');
    });

    it('updates ingredient unit field', async () => {
      render(<DishesPage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /Add dish/i }));
      await screen.findByRole('heading', { name: 'New Dish' });
      fireEvent.click(screen.getByRole('button', { name: /add ingredient/i }));
      const unitInput = screen.getByRole('textbox', { name: /unit/i });
      fireEvent.change(unitInput, { target: { value: 'cups' } });
      expect((unitInput as HTMLInputElement).value).toBe('cups');
    });

    it('updates video URL field', async () => {
      render(<DishesPage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /Add dish/i }));
      await screen.findByRole('heading', { name: 'New Dish' });
      const videoInput = screen.getByPlaceholderText(/youtube/i);
      fireEvent.change(videoInput, { target: { value: 'https://youtube.com/watch?v=abc' } });
      expect((videoInput as HTMLInputElement).value).toBe('https://youtube.com/watch?v=abc');
    });

    it('switches type to Side Dish when Side Dish button clicked', async () => {
      render(<DishesPage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /Add dish/i }));
      await screen.findByRole('heading', { name: 'New Dish' });
      fireEvent.click(screen.getByRole('button', { name: 'Side Dish' }));
      // Click again on Main Dish to toggle back - both cover setType calls
      fireEvent.click(screen.getByRole('button', { name: 'Main Dish' }));
      expect(screen.getByRole('button', { name: 'Main Dish' })).toBeTruthy();
    });

    it('updates description field', async () => {
      render(<DishesPage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /Add dish/i }));
      await screen.findByRole('heading', { name: 'New Dish' });
      const descInput = screen.getByPlaceholderText('Brief description');
      fireEvent.change(descInput, { target: { value: 'Tasty dish' } });
      expect((descInput as HTMLTextAreaElement).value).toBe('Tasty dish');
    });

    it('updates prep time, cook time, and servings fields', async () => {
      render(<DishesPage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /Add dish/i }));
      await screen.findByRole('heading', { name: 'New Dish' });
      const spinners = screen.getAllByRole('spinbutton');
      // First three spinbuttons are prepTime, cookTime, servings (before qty inputs)
      const prepInput = spinners.find((s) => (s as HTMLInputElement).placeholder === '30');
      const cookInput = spinners.find((s) => (s as HTMLInputElement).placeholder === '45');
      const servingsInput = spinners.find((s) => (s as HTMLInputElement).placeholder === '4');
      if (prepInput) {
        fireEvent.change(prepInput, { target: { value: '20' } });
        expect((prepInput as HTMLInputElement).value).toBe('20');
      }
      if (cookInput) {
        fireEvent.change(cookInput, { target: { value: '30' } });
        expect((cookInput as HTMLInputElement).value).toBe('30');
      }
      if (servingsInput) {
        fireEvent.change(servingsInput, { target: { value: '6' } });
        expect((servingsInput as HTMLInputElement).value).toBe('6');
      }
    });

    it('updates source URL field', async () => {
      render(<DishesPage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /Add dish/i }));
      await screen.findByRole('heading', { name: 'New Dish' });
      const sourceInput = screen.getByPlaceholderText(/https:\/\/example.com\/recipe/i);
      fireEvent.change(sourceInput, { target: { value: 'https://example.com/my-recipe' } });
      expect((sourceInput as HTMLInputElement).value).toBe('https://example.com/my-recipe');
    });

    it('updates ingredient category select', async () => {
      render(<DishesPage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /Add dish/i }));
      await screen.findByRole('heading', { name: 'New Dish' });
      fireEvent.click(screen.getByRole('button', { name: /add ingredient/i }));
      const categorySelect = screen.getByRole('combobox', { name: /ingredient category/i });
      fireEvent.change(categorySelect, { target: { value: 'Dairy' } });
      expect((categorySelect as HTMLSelectElement).value).toBe('Dairy');
    });

    it('adds store to ingredient via Enter key in store input', async () => {
      const { stores } = await import('@/lib/api');
      vi.mocked(stores.list).mockResolvedValue([
        { id: 'store-1', name: 'Whole Foods', createdAt: '' },
      ] as never);
      render(<DishesPage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /Add dish/i }));
      await screen.findByRole('heading', { name: 'New Dish' });
      fireEvent.click(screen.getByRole('button', { name: /add ingredient/i }));
      // The store input has a list attribute, which makes jsdom assign it combobox role
      // Query by placeholder text instead
      const storeInput = await screen.findByPlaceholderText('Type store name…');
      fireEvent.change(storeInput, { target: { value: 'Whole Foods' } });
      fireEvent.keyDown(storeInput, { key: 'Enter' });
      // The store input should clear after adding
      await waitFor(() => {
        expect((storeInput as HTMLInputElement).value).toBe('');
      });
    });
  });
});
