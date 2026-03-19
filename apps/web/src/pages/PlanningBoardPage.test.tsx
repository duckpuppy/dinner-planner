import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PlanningBoardPage } from './PlanningBoardPage';
import type { DinnerEntry, UpdateEntryData } from '@/lib/api';

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
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/Skeleton', () => ({
  SkeletonList: () => <div data-testid="skeleton-list" />,
}));

vi.mock('@/components/ErrorState', () => ({
  ErrorState: ({ message }: { message: string }) => <div data-testid="error-state">{message}</div>,
}));

vi.mock('@/components/SuggestionModal', () => ({
  SuggestionModal: ({
    open,
    onClose,
    onSelect,
  }: {
    open: boolean;
    onClose: () => void;
    onSelect: (dish: { id: string; name: string }) => void;
  }) =>
    open ? (
      <div data-testid="suggestion-modal">
        <button onClick={onClose}>Close</button>
        <button onClick={() => onSelect({ id: 'dish-1', name: 'Pizza' })}>Select Pizza</button>
      </div>
    ) : null,
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useDraggable: () => ({ attributes: {}, listeners: {}, setNodeRef: vi.fn(), transform: null }),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Translate: { toString: vi.fn(() => '') } },
}));

import { menus } from '@/lib/api';

function makeEntry(overrides: Partial<DinnerEntry> = {}): DinnerEntry {
  return {
    id: 'entry-1',
    date: '2024-06-17',
    dayOfWeek: 1,
    type: 'assembled',
    customText: null,
    restaurantName: null,
    restaurantNotes: null,
    completed: false,
    skipped: false,
    scale: 1,
    sourceEntryId: null,
    sourceEntryDishName: null,
    mainDish: null,
    sideDishes: [],
    preparations: [],
    createdAt: '2024-06-17T00:00:00Z',
    updatedAt: '2024-06-17T00:00:00Z',
    ...overrides,
  };
}

function makeWeekEntries(): DinnerEntry[] {
  const days = [
    '2024-06-16',
    '2024-06-17',
    '2024-06-18',
    '2024-06-19',
    '2024-06-20',
    '2024-06-21',
    '2024-06-22',
  ];
  return days.map((date, i) => makeEntry({ id: `entry-${i}`, date, dayOfWeek: i }));
}

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <MemoryRouter initialEntries={['/plan']}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

describe('PlanningBoardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it('shows skeleton while loading', () => {
    vi.mocked(menus.getWeek).mockReturnValue(new Promise(() => {}));
    render(<PlanningBoardPage />, { wrapper });
    expect(screen.getByTestId('skeleton-list')).toBeInTheDocument();
  });

  it('shows error state when fetch fails', async () => {
    vi.mocked(menus.getWeek).mockRejectedValue(new Error('Network error'));
    render(<PlanningBoardPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument();
    });
  });

  it('renders 7 day cards when data loads', async () => {
    const entries = makeWeekEntries();
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: {
        id: 'menu-1',
        weekStartDate: '2024-06-16',
        entries,
        createdAt: '2024-06-16T00:00:00Z',
        updatedAt: '2024-06-16T00:00:00Z',
      },
    });
    render(<PlanningBoardPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /add meal/i })).toHaveLength(7);
    });
  });

  it('shows progress chip with planned count', async () => {
    const entries = makeWeekEntries();
    entries[0] = makeEntry({
      id: 'entry-0',
      date: '2024-06-16',
      dayOfWeek: 0,
      mainDish: { id: 'd1', name: 'Pasta', type: 'main' },
    });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: {
        id: 'menu-1',
        weekStartDate: '2024-06-16',
        entries,
        createdAt: '',
        updatedAt: '',
      },
    });
    render(<PlanningBoardPage />, { wrapper });
    await waitFor(() => {
      expect(screen.getByLabelText(/1 of 7 days planned/i)).toBeInTheDocument();
    });
  });

  it('navigates to /week when Done is clicked', async () => {
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: {
        id: 'menu-1',
        weekStartDate: '2024-06-16',
        entries: makeWeekEntries(),
        createdAt: '',
        updatedAt: '',
      },
    });
    render(<PlanningBoardPage />, { wrapper });
    await waitFor(() => screen.getByRole('button', { name: /done/i }));
    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/week');
  });

  it('opens EntryEditor modal when Add meal is clicked', async () => {
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: {
        id: 'menu-1',
        weekStartDate: '2024-06-16',
        entries: makeWeekEntries(),
        createdAt: '',
        updatedAt: '',
      },
    });
    render(<PlanningBoardPage />, { wrapper });
    await waitFor(() => screen.getAllByRole('button', { name: /add meal/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /add meal/i })[0]);
    // EntryEditor renders a form with a Save button
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('closes EntryEditor modal when Cancel is clicked', async () => {
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: {
        id: 'menu-1',
        weekStartDate: '2024-06-16',
        entries: makeWeekEntries(),
        createdAt: '',
        updatedAt: '',
      },
    });
    render(<PlanningBoardPage />, { wrapper });
    await waitFor(() => screen.getAllByRole('button', { name: /add meal/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /add meal/i })[0]);
    // Cancel button closes the modal
    fireEvent.click(screen.getByRole('button', { name: /cancel editing/i }));
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });

  it('calls updateEntry when entry is saved', async () => {
    vi.mocked(menus.updateEntry).mockResolvedValue({ entry: makeEntry() });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: {
        id: 'menu-1',
        weekStartDate: '2024-06-16',
        entries: makeWeekEntries(),
        createdAt: '',
        updatedAt: '',
      },
    });
    render(<PlanningBoardPage />, { wrapper });
    await waitFor(() => screen.getAllByRole('button', { name: /add meal/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /add meal/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(menus.updateEntry).toHaveBeenCalledWith(
        'entry-0',
        expect.objectContaining<Partial<UpdateEntryData>>({ type: 'assembled' })
      );
    });
  });
});
