import { describe, it, expect, vi, afterEach } from 'vitest';
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
  DIETARY_TAGS: ['vegetarian', 'vegan', 'gluten_free', 'dairy_free', 'nut_free', 'low_carb'],
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
        expect(dishesApi.list).toHaveBeenCalledWith(
          expect.objectContaining({ archived: 'true' })
        );
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
});
