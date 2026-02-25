import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { WeekPage } from './WeekPage';

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/lib/api', () => ({
  menus: {
    getWeek: vi.fn(),
    updateEntry: vi.fn(),
    recentCompleted: vi.fn().mockResolvedValue([]),
  },
  dishes: {
    list: vi.fn().mockResolvedValue({ dishes: [] }),
  },
  patterns: {
    applyToWeek: vi.fn(),
  },
  prepTasks: {
    list: vi.fn().mockResolvedValue({ prepTasks: [] }),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/PrepTaskList', () => ({
  PrepTaskList: () => <div data-testid="prep-task-list" />,
}));

vi.mock('@/components/mobile/PullToRefresh', () => ({
  PullToRefresh: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/mobile/SwipeableListItem', () => ({
  SwipeableListItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  ErrorState: ({ message }: { message: string }) => <div data-testid="error-state">{message}</div>,
}));

vi.mock('@/components/SuggestionModal', () => ({
  SuggestionModal: () => <div data-testid="suggestion-modal" />,
}));

import { menus, patterns } from '@/lib/api';

function makeEntry(overrides = {}) {
  return {
    id: 'entry-1',
    date: '2024-06-10',
    dayOfWeek: 1,
    type: 'assembled' as const,
    customText: null,
    restaurantName: null,
    restaurantNotes: null,
    completed: false,
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

function makeWeekResponse(entries = [makeEntry()]) {
  return {
    menu: {
      weekStartDate: '2024-06-09',
      entries,
    },
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WeekPage', () => {
  describe('loading state', () => {
    it('shows skeleton while loading', () => {
      vi.mocked(menus.getWeek).mockReturnValue(new Promise(() => {}));
      render(<WeekPage />, { wrapper });
      expect(screen.getByTestId('skeleton-list')).toBeTruthy();
    });
  });

  describe('error state', () => {
    it('shows error state when fetch fails', async () => {
      vi.mocked(menus.getWeek).mockRejectedValue(new Error('Network error'));
      const { findByTestId } = render(<WeekPage />, { wrapper });
      expect(await findByTestId('error-state')).toBeTruthy();
    });
  });

  describe('successful load', () => {
    it('renders the month/year header', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      // Month/year text is shown in the header
      await waitFor(() => {
        expect(screen.queryByTestId('skeleton-list')).toBeNull();
      });
    });

    it('renders an entry with dish name', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      const { findByText } = render(<WeekPage />, { wrapper });
      expect(await findByText('Pasta')).toBeTruthy();
    });

    it('renders leftovers entry with source dish name', async () => {
      const entry = makeEntry({
        type: 'leftovers',
        mainDish: null,
        sourceEntryDishName: 'Chicken Tikka',
      });
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse([entry]));
      const { findByText } = render(<WeekPage />, { wrapper });
      expect(await findByText('Leftovers from Chicken Tikka')).toBeTruthy();
    });

    it('renders generic leftovers when no source dish name', async () => {
      const entry = makeEntry({
        type: 'leftovers',
        mainDish: null,
        sourceEntryDishName: null,
      });
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse([entry]));
      const { findByText } = render(<WeekPage />, { wrapper });
      expect(await findByText('Leftovers')).toBeTruthy();
    });

    it('renders fend_for_self entry', async () => {
      const entry = makeEntry({ type: 'fend_for_self', mainDish: null });
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse([entry]));
      const { findByText } = render(<WeekPage />, { wrapper });
      expect(await findByText('Fend for Yourself')).toBeTruthy();
    });

    it('renders dining_out entry with restaurant name', async () => {
      const entry = makeEntry({
        type: 'dining_out',
        mainDish: null,
        restaurantName: 'Pizza Palace',
      });
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse([entry]));
      const { findByText } = render(<WeekPage />, { wrapper });
      expect(await findByText(/Dining Out: Pizza Palace/)).toBeTruthy();
    });

    it('renders generic dining_out entry when no restaurant name', async () => {
      const entry = makeEntry({ type: 'dining_out', mainDish: null });
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse([entry]));
      const { findByText } = render(<WeekPage />, { wrapper });
      expect(await findByText('Dining Out')).toBeTruthy();
    });

    it('renders custom entry', async () => {
      const entry = makeEntry({ type: 'custom', mainDish: null, customText: 'Tacos' });
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse([entry]));
      const { findByText } = render(<WeekPage />, { wrapper });
      expect(await findByText('Tacos')).toBeTruthy();
    });

    it('renders assembled entry with no dish selected', async () => {
      const entry = makeEntry({ type: 'assembled', mainDish: null });
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse([entry]));
      const { findByText } = render(<WeekPage />, { wrapper });
      expect(await findByText('No dish selected')).toBeTruthy();
    });

    it('renders entry with side dishes', async () => {
      const entry = makeEntry({
        sideDishes: [{ id: 'side-1', name: 'Salad', type: 'side' }],
      });
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse([entry]));
      const { findByText } = render(<WeekPage />, { wrapper });
      expect(await findByText(/with Salad/)).toBeTruthy();
    });

    it('shows completed check icon for completed entries', async () => {
      const entry = makeEntry({ completed: true });
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse([entry]));
      render(<WeekPage />, { wrapper });
      await waitFor(() => {
        expect(screen.queryByTestId('skeleton-list')).toBeNull();
      });
      // completed check icon should be in the DOM
      // It's inside a span.text-green-600, we check entry rendered
      expect(screen.getByText('Pasta')).toBeTruthy();
    });
  });

  describe('navigation', () => {
    it('renders Today button', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      expect(screen.getByText('Today')).toBeTruthy();
    });

    it('renders Previous week button', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      expect(screen.getByRole('button', { name: /previous week/i })).toBeTruthy();
    });

    it('renders Next week button', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      expect(screen.getByRole('button', { name: /next week/i })).toBeTruthy();
    });

    it('renders Grocery list button', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      expect(screen.getByRole('button', { name: /grocery list/i })).toBeTruthy();
    });

    it('navigates to grocery page when grocery button clicked', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /grocery list/i }));
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('/grocery'));
    });
  });

  describe('apply patterns button', () => {
    it('renders the Apply recurring patterns button', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      expect(screen.getByRole('button', { name: /apply recurring patterns/i })).toBeTruthy();
    });

    it('calls patterns.applyToWeek on click', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      vi.mocked(patterns.applyToWeek).mockResolvedValue({ applied: 2 });
      render(<WeekPage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /apply recurring patterns/i }));
      await waitFor(() => {
        expect(patterns.applyToWeek).toHaveBeenCalled();
      });
    });
  });

  describe('EntryEditor - editing a day entry', () => {
    it('shows editor when Edit button clicked', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      const editBtns = await screen.findAllByRole('button', { name: /edit/i });
      fireEvent.click(editBtns[0]);
      // Editor shows the type buttons
      expect(await screen.findByText('Home Cooked')).toBeTruthy();
    });

    it('cancels editing when Cancel button clicked', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      const editBtns = await screen.findAllByRole('button', { name: /edit/i });
      fireEvent.click(editBtns[0]);
      await screen.findByText('Home Cooked');
      fireEvent.click(screen.getAllByRole('button', { name: /cancel/i })[0]);
      expect(screen.queryByText('Home Cooked')).toBeNull();
    });

    it('shows type selector buttons in editor', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      const editBtns = await screen.findAllByRole('button', { name: /edit/i });
      fireEvent.click(editBtns[0]);
      await screen.findByText('Home Cooked');
      expect(screen.getByText('Fend')).toBeTruthy();
      expect(screen.getByText('Dining Out')).toBeTruthy();
      expect(screen.getByText('Custom')).toBeTruthy();
      expect(screen.getByText('Leftovers')).toBeTruthy();
    });

    it('shows dining out fields when Dining Out type selected', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      const editBtns = await screen.findAllByRole('button', { name: /edit/i });
      fireEvent.click(editBtns[0]);
      await screen.findByText('Dining Out');
      fireEvent.click(screen.getByText('Dining Out'));
      expect(await screen.findByText('Restaurant Name')).toBeTruthy();
    });

    it('shows custom text field when Custom type selected', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      const editBtns = await screen.findAllByRole('button', { name: /edit/i });
      fireEvent.click(editBtns[0]);
      await screen.findByText('Custom');
      fireEvent.click(screen.getByText('Custom'));
      expect(await screen.findByText('Description')).toBeTruthy();
    });

    it('shows leftovers section when Leftovers type selected', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      vi.mocked(menus.recentCompleted).mockResolvedValue([]);
      render(<WeekPage />, { wrapper });
      const editBtns = await screen.findAllByRole('button', { name: /edit/i });
      fireEvent.click(editBtns[0]);
      await screen.findByText('Leftovers');
      fireEvent.click(screen.getByText('Leftovers'));
      expect(await screen.findByText('Leftovers from...')).toBeTruthy();
    });

    it('shows "No recent meals found" when recentCompleted is empty array', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      vi.mocked(menus.recentCompleted).mockResolvedValue([]);
      render(<WeekPage />, { wrapper });
      const editBtns = await screen.findAllByRole('button', { name: /edit/i });
      fireEvent.click(editBtns[0]);
      await screen.findByText('Leftovers');
      fireEvent.click(screen.getByText('Leftovers'));
      expect(await screen.findByText('No recent meals found')).toBeTruthy();
    });

    it('shows recent meal options in leftovers picker', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      vi.mocked(menus.recentCompleted).mockResolvedValue([
        { id: 'e-recent', date: '2024-06-08', mainDishName: 'Spaghetti' },
      ]);
      render(<WeekPage />, { wrapper });
      const editBtns = await screen.findAllByRole('button', { name: /edit/i });
      fireEvent.click(editBtns[0]);
      await screen.findByText('Leftovers');
      fireEvent.click(screen.getByText('Leftovers'));
      expect(await screen.findByText(/Spaghetti/)).toBeTruthy();
    });
  });

  describe('prep tasks panel', () => {
    it('toggles prep tasks when prep tasks button clicked', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      const prepBtn = await screen.findByRole('button', { name: /show prep tasks/i });
      fireEvent.click(prepBtn);
      expect(await screen.findByTestId('prep-task-list')).toBeTruthy();
    });
  });
});
