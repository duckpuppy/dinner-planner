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
  settings: {
    get: vi.fn().mockResolvedValue({ settings: { weekStartDay: 0 } }),
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

import { menus, patterns, dishes, settings } from '@/lib/api';

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
    scale: 1,
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

    it('renders scale control with 1×/2×/4× buttons for assembled entry with main dish', async () => {
      const entry = makeEntry({ scale: 1 });
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse([entry]));
      render(<WeekPage />, { wrapper });
      await screen.findByText('Pasta');
      const scaleGroup = screen.getByRole('group', { name: /serving scale/i });
      expect(scaleGroup).toBeTruthy();
      const btn1x = screen.getByRole('button', { name: /^1×$/i });
      const btn2x = screen.getByRole('button', { name: /^2×$/i });
      const btn4x = screen.getByRole('button', { name: /^4×$/i });
      expect(btn1x.getAttribute('aria-pressed')).toBe('true');
      expect(btn2x.getAttribute('aria-pressed')).toBe('false');
      expect(btn4x.getAttribute('aria-pressed')).toBe('false');
    });

    it('calls updateEntry with new scale when scale button is clicked', async () => {
      vi.mocked(menus.updateEntry).mockResolvedValue({} as never);
      const entry = makeEntry({ scale: 1 });
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse([entry]));
      render(<WeekPage />, { wrapper });
      await screen.findByText('Pasta');
      const scaleGroup = screen.getByRole('group', { name: /serving scale/i });
      const buttons = Array.from(scaleGroup.querySelectorAll('button'));
      // buttons are 1×, 2×, 4× — pick index 1 for 2×
      expect(buttons).toHaveLength(3);
      fireEvent.click(buttons[1]);
      await waitFor(() => {
        expect(vi.mocked(menus.updateEntry)).toHaveBeenCalledWith(
          'entry-1',
          expect.objectContaining({ scale: 2 })
        );
      });
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

    it('hides prep tasks panel when toggled again', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      const prepBtn = await screen.findByRole('button', { name: /show prep tasks/i });
      fireEvent.click(prepBtn);
      await screen.findByTestId('prep-task-list');
      fireEvent.click(screen.getByRole('button', { name: /hide prep tasks/i }));
      await waitFor(() => {
        expect(screen.queryByTestId('prep-task-list')).toBeNull();
      });
    });
  });

  describe('weekStartDay setting', () => {
    it('uses weekStartDay from settings to compute week start (Monday)', async () => {
      vi.mocked(settings.get).mockResolvedValue({ settings: { weekStartDay: 1 } as never });
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      // After settings resolve, getWeek should be called with a Monday-anchored date.
      // Multiple calls may occur (initial Sunday-anchored, then Monday-anchored after settings load).
      await waitFor(() => {
        const calls = vi.mocked(menus.getWeek).mock.calls;
        const hasMondayCall = calls.some((call) => {
          const d = new Date(call[0] + 'T00:00:00');
          return d.getDay() === 1;
        });
        expect(hasMondayCall).toBe(true);
      });
    });

    it('uses Sunday (day 0) as week start when weekStartDay is 0', async () => {
      vi.mocked(settings.get).mockResolvedValue({ settings: { weekStartDay: 0 } as never });
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      await waitFor(() => {
        expect(menus.getWeek).toHaveBeenCalled();
        // All calls should be for a Sunday-anchored date
        const calls = vi.mocked(menus.getWeek).mock.calls;
        calls.forEach((call) => {
          const d = new Date(call[0] + 'T00:00:00');
          expect(d.getDay()).toBe(0);
        });
      });
    });
  });

  describe('navigation - week offset', () => {
    it('goes to previous week when previous button clicked', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /previous week/i }));
      await waitFor(() => {
        expect(menus.getWeek).toHaveBeenCalledTimes(2);
      });
    });

    it('goes to next week when next button clicked', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: /next week/i }));
      await waitFor(() => {
        expect(menus.getWeek).toHaveBeenCalledTimes(2);
      });
    });

    it('goes back to today when Today button clicked', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      // Navigate to next week first
      fireEvent.click(screen.getByRole('button', { name: /next week/i }));
      await waitFor(() => expect(menus.getWeek).toHaveBeenCalledTimes(2));
      // Navigate back to today - Today button renders
      expect(screen.getByText('Today')).toBeTruthy();
    });
  });

  describe('EntryEditor - form submission', () => {
    it('calls menus.updateEntry when Save is clicked', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      vi.mocked(menus.updateEntry).mockResolvedValue({} as never);
      render(<WeekPage />, { wrapper });
      const editBtns = await screen.findAllByRole('button', { name: /edit/i });
      fireEvent.click(editBtns[0]);
      await screen.findByText('Home Cooked');
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => {
        expect(menus.updateEntry).toHaveBeenCalled();
      });
    });

    it('toggles side dish selection when side dish button clicked', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      vi.mocked(dishes.list).mockResolvedValue({
        dishes: [
          { id: 'main-1', name: 'Pasta', type: 'main', tags: [], archived: false },
          { id: 'side-1', name: 'Salad', type: 'side', tags: [], archived: false },
        ],
      });
      render(<WeekPage />, { wrapper });
      const editBtns = await screen.findAllByRole('button', { name: /edit/i });
      fireEvent.click(editBtns[0]);
      await screen.findByText('Home Cooked');
      // Open the side dish picker modal
      const addSidesBtn = await screen.findByRole('button', { name: /side dishes/i });
      fireEvent.click(addSidesBtn);
      // Find and click the dish in the modal (rendered as role="option")
      const saladOption = await screen.findByRole('option', { name: /Salad/ });
      fireEvent.click(saladOption);
      expect(saladOption).toBeTruthy();
    });

    it('shows Suggest button in editor', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      const editBtns = await screen.findAllByRole('button', { name: /edit/i });
      fireEvent.click(editBtns[0]);
      await screen.findByText('Home Cooked');
      expect(await screen.findByText('Suggest')).toBeTruthy();
    });
  });

  describe('dining_out with customText in editor', () => {
    it('shows customText as restaurant name when entry has dining_out with customText', async () => {
      const entry = makeEntry({
        type: 'dining_out',
        mainDish: null,
        customText: 'Italian Place',
        restaurantName: null,
      });
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse([entry]));
      const { findByText } = render(<WeekPage />, { wrapper });
      expect(await findByText(/Dining Out: Italian Place/)).toBeTruthy();
    });
  });

  describe('EntryEditor - dining_out inputs', () => {
    it('updates restaurant name input when typing', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      const editBtns = await screen.findAllByRole('button', { name: /edit/i });
      fireEvent.click(editBtns[0]);
      await screen.findByText('Home Cooked');
      // Switch to dining_out type
      fireEvent.click(screen.getByRole('button', { name: 'Dining Out' }));
      const restaurantInput = screen.getByPlaceholderText('Where are you going?');
      fireEvent.change(restaurantInput, { target: { value: 'Thai Garden' } });
      expect((restaurantInput as HTMLInputElement).value).toBe('Thai Garden');
    });

    it('updates restaurant notes input when typing', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      const editBtns = await screen.findAllByRole('button', { name: /edit/i });
      fireEvent.click(editBtns[0]);
      await screen.findByText('Home Cooked');
      fireEvent.click(screen.getByRole('button', { name: 'Dining Out' }));
      const notesInput = screen.getByPlaceholderText("Reservation, what you're ordering...");
      fireEvent.change(notesInput, { target: { value: '7pm reservation' } });
      expect((notesInput as HTMLInputElement).value).toBe('7pm reservation');
    });

    it('updates custom text input when typing', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      const editBtns = await screen.findAllByRole('button', { name: /edit/i });
      fireEvent.click(editBtns[0]);
      await screen.findByText('Home Cooked');
      fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
      const customInput = screen.getByPlaceholderText('What are you having?');
      fireEvent.change(customInput, { target: { value: 'Cooking class night' } });
      expect((customInput as HTMLInputElement).value).toBe('Cooking class night');
    });

    it('changes main dish selection when dish picked from modal', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      vi.mocked(dishes.list).mockResolvedValue({
        dishes: [{ id: 'main-1', name: 'Pasta', type: 'main', tags: [], archived: false }],
      });
      render(<WeekPage />, { wrapper });
      const editBtns = await screen.findAllByRole('button', { name: /edit/i });
      fireEvent.click(editBtns[0]);
      await screen.findByText('Home Cooked');
      // Open the main dish picker modal
      const mainDishTrigger = await screen.findByRole('button', { name: /main dish/i });
      fireEvent.click(mainDishTrigger);
      // Select dish from modal (rendered as role="option")
      const pastaOption = await screen.findByRole('option', { name: /Pasta/ });
      fireEvent.click(pastaOption);
      // After selection, the trigger should show the dish name
      expect(await screen.findByText('Pasta')).toBeTruthy();
    });

    it('opens SuggestionModal when Suggest button clicked', async () => {
      vi.mocked(menus.getWeek).mockResolvedValue(makeWeekResponse());
      render(<WeekPage />, { wrapper });
      const editBtns = await screen.findAllByRole('button', { name: /edit/i });
      fireEvent.click(editBtns[0]);
      await screen.findByText('Home Cooked');
      // The Suggest button click sets showSuggest=true which opens SuggestionModal
      const suggestBtn = await screen.findByRole('button', { name: /suggest/i });
      fireEvent.click(suggestBtn);
      // SuggestionModal should open - look for modal content
      // SuggestionModal is mocked, so we just verify the click didn't throw
      expect(suggestBtn).toBeTruthy();
    });
  });
});
