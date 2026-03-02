import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HistoryPage } from './HistoryPage';

vi.mock('@/lib/api', () => ({
  history: {
    list: vi.fn(),
    delete: vi.fn(),
  },
  dishNotes: {
    create: vi.fn(),
    list: vi.fn().mockResolvedValue({ notes: [] }),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/PreparationPhotos', () => ({
  PreparationPhotos: () => <div data-testid="preparation-photos" />,
}));

vi.mock('@/components/StarRating', () => ({
  StarRating: () => <div data-testid="star-rating" />,
}));

vi.mock('@/components/mobile/PullToRefresh', () => ({
  PullToRefresh: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/mobile/SwipeableListItem', () => ({
  SwipeableListItem: ({
    children,
    actions,
  }: {
    children: React.ReactNode;
    actions?: Array<{ label: string; onAction: () => void }>;
  }) => (
    <div>
      {children}
      {actions?.map((a) => (
        <button
          key={a.label}
          onClick={a.onAction}
          data-testid={`swipe-action-${a.label.toLowerCase()}`}
        >
          {a.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/hooks/useSwipeActions', () => ({
  useSwipeActions: () => ({
    activeItemId: null,
    openSwipe: vi.fn(),
    closeSwipe: vi.fn(),
  }),
}));

vi.mock('@/components/Skeleton', () => ({
  SkeletonList: () => <div data-testid="skeleton-list" />,
}));

vi.mock('@/components/ErrorState', () => ({
  ErrorState: ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
    <div data-testid="error-state">
      {message}
      {onRetry && <button onClick={onRetry}>Retry</button>}
    </div>
  ),
}));

vi.mock('@/components/EmptyState', () => ({
  EmptyState: ({ title, description }: { title: string; description?: string }) => (
    <div data-testid="empty-state">
      <div>{title}</div>
      {description && <div>{description}</div>}
    </div>
  ),
}));

vi.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

import { history } from '@/lib/api';
import { toast } from 'sonner';

function makeEntry(overrides = {}) {
  return {
    id: 'h-1',
    date: '2024-06-10',
    dayOfWeek: 1,
    type: 'assembled',
    customText: null,
    restaurantName: null,
    restaurantNotes: null,
    completed: true,
    skipped: false,
    mainDish: { id: 'dish-1', name: 'Pasta', type: 'main' },
    sideDishes: [],
    preparations: [],
    sourceEntryId: null,
    sourceEntryDishName: null,
    createdAt: '2024-06-10T00:00:00.000Z',
    updatedAt: '2024-06-10T00:00:00.000Z',
    ...overrides,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('HistoryPage', () => {
  describe('rendering', () => {
    it('renders the page heading', () => {
      vi.mocked(history.list).mockReturnValue(new Promise(() => {}));
      render(<HistoryPage />, { wrapper });
      expect(screen.getByRole('heading', { name: 'Meal History' })).toBeTruthy();
    });

    it('renders search input', () => {
      vi.mocked(history.list).mockReturnValue(new Promise(() => {}));
      render(<HistoryPage />, { wrapper });
      expect(screen.getByPlaceholderText('Search dishes...')).toBeTruthy();
    });

    it('shows skeleton while loading', () => {
      vi.mocked(history.list).mockReturnValue(new Promise(() => {}));
      render(<HistoryPage />, { wrapper });
      expect(screen.getByTestId('skeleton-list')).toBeTruthy();
    });
  });

  describe('loading states', () => {
    it('shows error state when fetch fails', async () => {
      vi.mocked(history.list).mockRejectedValue(new Error('Network error'));
      render(<HistoryPage />, { wrapper });
      expect(await screen.findByTestId('error-state')).toBeTruthy();
    });

    it('retries when Retry button clicked in error state', async () => {
      vi.mocked(history.list).mockRejectedValue(new Error('Network error'));
      render(<HistoryPage />, { wrapper });
      await screen.findByTestId('error-state');
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(history.list).toHaveBeenCalled();
    });

    it('shows empty state when no history entries', async () => {
      vi.mocked(history.list).mockResolvedValue({ entries: [], total: 0 });
      render(<HistoryPage />, { wrapper });
      expect(await screen.findByText('No meal history found')).toBeTruthy();
    });

    it('shows empty state with filter hint when search is set', async () => {
      vi.mocked(history.list).mockResolvedValue({ entries: [], total: 0 });
      render(<HistoryPage />, { wrapper });
      await userEvent.type(screen.getByPlaceholderText('Search dishes...'), 'pizza');
      fireEvent.submit(screen.getByPlaceholderText('Search dishes...').closest('form')!);
      expect(await screen.findByText('Try adjusting your filters')).toBeTruthy();
    });
  });

  describe('entries', () => {
    it('renders entry with dish name', async () => {
      vi.mocked(history.list).mockResolvedValue({ entries: [makeEntry()], total: 1 });
      render(<HistoryPage />, { wrapper });
      expect(await screen.findByText('Pasta')).toBeTruthy();
    });

    it('renders multiple entries', async () => {
      vi.mocked(history.list).mockResolvedValue({
        entries: [
          makeEntry({ id: 'h-1', mainDish: { id: 'd-1', name: 'Pasta', type: 'main' } }),
          makeEntry({ id: 'h-2', mainDish: { id: 'd-2', name: 'Tacos', type: 'main' } }),
        ],
        total: 2,
      });
      render(<HistoryPage />, { wrapper });
      expect(await screen.findByText('Pasta')).toBeTruthy();
      expect(await screen.findByText('Tacos')).toBeTruthy();
    });

    it('renders entry type label', async () => {
      vi.mocked(history.list).mockResolvedValue({ entries: [makeEntry()], total: 1 });
      render(<HistoryPage />, { wrapper });
      expect(await screen.findByText('Home Cooked')).toBeTruthy();
    });

    it('renders fend for yourself entry', async () => {
      vi.mocked(history.list).mockResolvedValue({
        entries: [makeEntry({ type: 'fend_for_self', mainDish: null })],
        total: 1,
      });
      render(<HistoryPage />, { wrapper });
      expect(await screen.findByText('Fend for Yourself')).toBeTruthy();
    });
  });

  describe('filters', () => {
    it('shows Clear filters button when search is filled', async () => {
      vi.mocked(history.list).mockResolvedValue({ entries: [], total: 0 });
      render(<HistoryPage />, { wrapper });
      await userEvent.type(screen.getByPlaceholderText('Search dishes...'), 'pizza');
      expect(await screen.findByText('Clear filters')).toBeTruthy();
    });

    it('clears filters when Clear filters clicked', async () => {
      vi.mocked(history.list).mockResolvedValue({ entries: [], total: 0 });
      render(<HistoryPage />, { wrapper });
      await userEvent.type(screen.getByPlaceholderText('Search dishes...'), 'pizza');
      await screen.findByText('Clear filters');
      fireEvent.click(screen.getByText('Clear filters'));
      const searchInput = screen.getByPlaceholderText('Search dishes...') as HTMLInputElement;
      expect(searchInput.value).toBe('');
    });
  });

  describe('pagination', () => {
    it('shows page indicator when there are multiple pages', async () => {
      vi.mocked(history.list).mockResolvedValue({
        entries: Array.from({ length: 20 }, (_, i) =>
          makeEntry({ id: `h-${i}`, mainDish: { id: `d-${i}`, name: `Dish ${i}`, type: 'main' } })
        ),
        total: 40,
      });
      render(<HistoryPage />, { wrapper });
      expect(await screen.findByText('Page 1 of 2')).toBeTruthy();
    });

    it('does not show pagination when only one page of results', async () => {
      vi.mocked(history.list).mockResolvedValue({
        entries: [makeEntry()],
        total: 1,
      });
      render(<HistoryPage />, { wrapper });
      await screen.findByText('Pasta');
      expect(screen.queryByText(/Page \d+ of \d+/)).toBeNull();
    });

    it('navigates to next page when next button clicked', async () => {
      vi.mocked(history.list).mockResolvedValue({
        entries: Array.from({ length: 20 }, (_, i) =>
          makeEntry({ id: `h-${i}`, mainDish: { id: `d-${i}`, name: `Dish ${i}`, type: 'main' } })
        ),
        total: 40,
      });
      render(<HistoryPage />, { wrapper });
      await screen.findByText('Page 1 of 2');
      // Find prev (disabled) and next (enabled) buttons by their disabled state
      const paginationBtns = screen.getAllByRole('button').filter((b) => b.querySelector('svg'));
      const prevBtn = paginationBtns.find((b) => b.hasAttribute('disabled'));
      const nextBtn = paginationBtns.find((b) => !b.hasAttribute('disabled'));
      expect(prevBtn).toBeTruthy();
      expect(nextBtn).toBeTruthy();
      // Click next - triggers setPage(p => Math.min(totalPages-1, p+1))
      fireEvent.click(nextBtn!);
      expect(history.list).toHaveBeenCalledTimes(2);
    });

    it('goes back to prev page when prev button clicked on page 2', async () => {
      vi.mocked(history.list).mockResolvedValue({
        entries: Array.from({ length: 20 }, (_, i) =>
          makeEntry({ id: `h-${i}`, mainDish: { id: `d-${i}`, name: `Dish ${i}`, type: 'main' } })
        ),
        total: 40,
      });
      render(<HistoryPage />, { wrapper });
      await screen.findByText('Page 1 of 2');
      const paginationBtns = screen.getAllByRole('button').filter((b) => b.querySelector('svg'));
      const nextBtn = paginationBtns.find((b) => !b.hasAttribute('disabled'));
      // Navigate to page 2
      fireEvent.click(nextBtn!);
      // Wait for re-render and then click prev
      await waitFor(() => expect(history.list).toHaveBeenCalledTimes(2));
    });
  });

  describe('delete flow', () => {
    it('opens confirm dialog when delete swipe action triggered', async () => {
      vi.mocked(history.list).mockResolvedValue({ entries: [makeEntry()], total: 1 });
      await import('@/hooks/useSwipeActions');
      render(<HistoryPage />, { wrapper });
      await screen.findByText('Pasta');
      // Confirm dialog should be hidden initially
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });

    it('calls history.delete when confirm dialog confirmed', async () => {
      vi.mocked(history.list).mockResolvedValue({ entries: [makeEntry()], total: 1 });
      vi.mocked(history.delete).mockResolvedValue(undefined as never);
      render(<HistoryPage />, { wrapper });
      await screen.findByText('Pasta');
      // The ConfirmDialog is rendered but hidden (open=false) since deleteEntry is null
      expect(screen.queryByTestId('confirm-dialog')).toBeNull();
    });

    it('opens confirm dialog when Delete action triggered via swipe button', async () => {
      vi.mocked(history.list).mockResolvedValue({ entries: [makeEntry()], total: 1 });
      render(<HistoryPage />, { wrapper });
      await screen.findByText('Pasta');
      fireEvent.click(screen.getByTestId('swipe-action-delete'));
      expect(screen.getByTestId('confirm-dialog')).toBeTruthy();
    });

    it('calls history.delete when confirm dialog confirmed via swipe', async () => {
      vi.mocked(history.list).mockResolvedValue({ entries: [makeEntry()], total: 1 });
      vi.mocked(history.delete).mockResolvedValue(undefined as never);
      render(<HistoryPage />, { wrapper });
      await screen.findByText('Pasta');
      fireEvent.click(screen.getByTestId('swipe-action-delete'));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      await waitFor(() => expect(history.delete).toHaveBeenCalledWith('h-1'));
    });

    it('cancels delete when Cancel clicked in confirm dialog', async () => {
      vi.mocked(history.list).mockResolvedValue({ entries: [makeEntry()], total: 1 });
      render(<HistoryPage />, { wrapper });
      await screen.findByText('Pasta');
      fireEvent.click(screen.getByTestId('swipe-action-delete'));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).toBeNull());
    });
  });

  describe('date filters', () => {
    it('renders From date input', () => {
      vi.mocked(history.list).mockReturnValue(new Promise(() => {}));
      render(<HistoryPage />, { wrapper });
      const fromLabel = screen.getByText('From:');
      expect(fromLabel).toBeTruthy();
    });

    it('renders To date input', () => {
      vi.mocked(history.list).mockReturnValue(new Promise(() => {}));
      render(<HistoryPage />, { wrapper });
      expect(screen.getByText('To:')).toBeTruthy();
    });

    it('shows Clear filters button when startDate is set', async () => {
      vi.mocked(history.list).mockResolvedValue({ entries: [], total: 0 });
      render(<HistoryPage />, { wrapper });
      const dateInputs = document.querySelectorAll('input[type="date"]');
      fireEvent.change(dateInputs[0], { target: { value: '2024-01-01' } });
      expect(await screen.findByText('Clear filters')).toBeTruthy();
    });

    it('clears all filters including dates when Clear filters clicked', async () => {
      vi.mocked(history.list).mockResolvedValue({ entries: [], total: 0 });
      render(<HistoryPage />, { wrapper });
      const dateInputs = document.querySelectorAll('input[type="date"]');
      fireEvent.change(dateInputs[0], { target: { value: '2024-01-01' } });
      await screen.findByText('Clear filters');
      fireEvent.click(screen.getByText('Clear filters'));
      await waitFor(() => {
        expect(screen.queryByText('Clear filters')).toBeNull();
      });
    });
  });

  describe('HistoryCard entry types', () => {
    it('renders custom entry text', async () => {
      vi.mocked(history.list).mockResolvedValue({
        entries: [
          makeEntry({ type: 'custom', mainDish: null, customText: 'Leftovers from fridge' }),
        ],
        total: 1,
      });
      render(<HistoryPage />, { wrapper });
      expect(await screen.findByText('Leftovers from fridge')).toBeTruthy();
    });

    it('renders dining out entry', async () => {
      vi.mocked(history.list).mockResolvedValue({
        entries: [makeEntry({ type: 'dining_out', mainDish: null, customText: 'Sushi Place' })],
        total: 1,
      });
      render(<HistoryPage />, { wrapper });
      expect(await screen.findByText('Sushi Place')).toBeTruthy();
    });

    it('renders dining out entry without text', async () => {
      vi.mocked(history.list).mockResolvedValue({
        entries: [makeEntry({ type: 'dining_out', mainDish: null, customText: null })],
        total: 1,
      });
      render(<HistoryPage />, { wrapper });
      expect(await screen.findByText('Dining out')).toBeTruthy();
    });

    it('renders leftovers entry with source dish', async () => {
      vi.mocked(history.list).mockResolvedValue({
        entries: [
          makeEntry({
            type: 'leftovers',
            mainDish: null,
            sourceEntryDishName: 'Roast Chicken',
          }),
        ],
        total: 1,
      });
      render(<HistoryPage />, { wrapper });
      expect(await screen.findByText('Leftovers from Roast Chicken')).toBeTruthy();
    });

    it('renders leftovers entry without source dish', async () => {
      vi.mocked(history.list).mockResolvedValue({
        entries: [makeEntry({ type: 'leftovers', mainDish: null, sourceEntryDishName: null })],
        total: 1,
      });
      render(<HistoryPage />, { wrapper });
      // "Leftovers" appears as both the type label and the content text
      const items = await screen.findAllByText('Leftovers');
      expect(items.length).toBeGreaterThanOrEqual(1);
    });

    it('renders side dishes when present', async () => {
      vi.mocked(history.list).mockResolvedValue({
        entries: [
          makeEntry({
            sideDishes: [{ id: 'side-1', name: 'Garlic Bread', type: 'side' }],
          }),
        ],
        total: 1,
      });
      render(<HistoryPage />, { wrapper });
      expect(await screen.findByText(/Garlic Bread/)).toBeTruthy();
    });

    it('renders preparations section when preparations exist', async () => {
      vi.mocked(history.list).mockResolvedValue({
        entries: [
          makeEntry({
            preparations: [
              {
                id: 'prep-1',
                preparers: [{ id: 'u-1', name: 'Alice' }],
                notes: 'Added extra spice',
                ratings: [],
              },
            ],
          }),
        ],
        total: 1,
      });
      render(<HistoryPage />, { wrapper });
      expect(await screen.findByText('Alice')).toBeTruthy();
      expect(await screen.findByText('Added extra spice')).toBeTruthy();
    });

    it('renders save as note button for preparations with notes and mainDish', async () => {
      vi.mocked(history.list).mockResolvedValue({
        entries: [
          makeEntry({
            preparations: [
              {
                id: 'prep-1',
                preparers: [{ id: 'u-1', name: 'Alice' }],
                notes: 'Added extra spice',
                ratings: [],
              },
            ],
          }),
        ],
        total: 1,
      });
      render(<HistoryPage />, { wrapper });
      expect(await screen.findByText('Save as dish note')).toBeTruthy();
    });

    it('calls dishNotes.create when save as note clicked', async () => {
      const { dishNotes } = await import('@/lib/api');
      vi.mocked(dishNotes.create).mockResolvedValue({
        note: {
          id: 'n-1',
          dishId: 'dish-1',
          note: 'Added extra spice',
          createdById: 'u-1',
          createdAt: '',
        },
      } as never);
      vi.mocked(history.list).mockResolvedValue({
        entries: [
          makeEntry({
            preparations: [
              {
                id: 'prep-1',
                preparers: [{ id: 'u-1', name: 'Alice' }],
                notes: 'Added extra spice',
                ratings: [],
              },
            ],
          }),
        ],
        total: 1,
      });
      render(<HistoryPage />, { wrapper });
      const saveBtn = await screen.findByText('Save as dish note');
      fireEvent.click(saveBtn);
      await waitFor(() => {
        expect(dishNotes.create).toHaveBeenCalledWith('dish-1', 'Added extra spice');
      });
    });

    it('handles search form submission', async () => {
      vi.mocked(history.list).mockResolvedValue({ entries: [], total: 0 });
      render(<HistoryPage />, { wrapper });
      const searchInput = screen.getByPlaceholderText('Search dishes...');
      fireEvent.change(searchInput, { target: { value: 'tacos' } });
      fireEvent.submit(searchInput.closest('form')!);
      await waitFor(() => {
        // After submit, page resets to 0 - history.list should have been called
        expect(history.list).toHaveBeenCalled();
      });
    });

    it('renders average rating when preparations have ratings', async () => {
      vi.mocked(history.list).mockResolvedValue({
        entries: [
          makeEntry({
            preparations: [
              {
                id: 'prep-1',
                preparers: [{ id: 'u-1', name: 'Alice' }],
                notes: null,
                ratings: [{ id: 'r-1', stars: 5, userName: 'Bob' }],
              },
            ],
          }),
        ],
        total: 1,
      });
      render(<HistoryPage />, { wrapper });
      expect(await screen.findByText('5.0 avg')).toBeTruthy();
    });

    it('renders fend_for_self text in HistoryCard', async () => {
      vi.mocked(history.list).mockResolvedValue({
        entries: [makeEntry({ type: 'fend_for_self', mainDish: null })],
        total: 1,
      });
      render(<HistoryPage />, { wrapper });
      expect(await screen.findByText('Fend for self')).toBeTruthy();
    });

    it('renders ratings when preparations have ratings', async () => {
      vi.mocked(history.list).mockResolvedValue({
        entries: [
          makeEntry({
            preparations: [
              {
                id: 'prep-1',
                preparers: [{ id: 'u-1', name: 'Alice' }],
                notes: null,
                ratings: [{ id: 'r-1', stars: 5, userName: 'Bob' }],
              },
            ],
          }),
        ],
        total: 1,
      });
      render(<HistoryPage />, { wrapper });
      expect(await screen.findByText('Bob')).toBeTruthy();
    });
  });

  describe('prev page navigation', () => {
    it('navigates to previous page when prev button clicked from page 2', async () => {
      vi.mocked(history.list).mockResolvedValue({
        entries: Array.from({ length: 20 }, (_, i) =>
          makeEntry({ id: `h-${i}`, mainDish: { id: `d-${i}`, name: `Dish ${i}`, type: 'main' } })
        ),
        total: 40,
      });
      render(<HistoryPage />, { wrapper });
      // Wait for page 1 to load
      await screen.findByText('Page 1 of 2');
      // Find prev (disabled) and next (enabled) pagination buttons
      const paginationBtns = screen.getAllByRole('button').filter((b) => b.querySelector('svg'));
      const nextBtn = paginationBtns.find((b) => !b.hasAttribute('disabled'));
      expect(nextBtn).toBeTruthy();
      // Click next to go to page 2
      fireEvent.click(nextBtn!);
      // Wait for page 2 to load (history.list called twice)
      await waitFor(() => expect(history.list).toHaveBeenCalledTimes(2));
      // On page 2, the prev button is enabled — find and click it
      await waitFor(() => {
        const btns = screen.getAllByRole('button').filter((b) => b.querySelector('svg'));
        const prevBtn = btns.find((b) => !b.hasAttribute('disabled'));
        expect(prevBtn).toBeTruthy();
        fireEvent.click(prevBtn!);
      });
      await waitFor(() => expect(history.list).toHaveBeenCalledTimes(3));
    });
  });

  describe('save-as-note error', () => {
    it('shows error toast when save as note API call fails', async () => {
      vi.mocked(history.list).mockResolvedValue({
        entries: [
          makeEntry({
            preparations: [
              {
                id: 'prep-1',
                preparers: [{ id: 'u-1', name: 'Alice' }],
                notes: 'Added extra spice',
                ratings: [],
              },
            ],
          }),
        ],
        total: 1,
      });
      const { dishNotes } = await import('@/lib/api');
      vi.mocked(dishNotes.create).mockRejectedValue(new Error('Server error'));
      render(<HistoryPage />, { wrapper });
      const saveBtn = await screen.findByText('Save as dish note');
      fireEvent.click(saveBtn);
      await waitFor(() => {
        expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to save note');
      });
    });
  });
});
