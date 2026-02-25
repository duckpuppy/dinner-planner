import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TodayPage } from './TodayPage';

vi.mock('@/lib/api', () => ({
  menus: {
    getToday: vi.fn(),
    getWeek: vi.fn(),
    skipEntry: vi.fn(),
  },
  prepTasks: {
    list: vi.fn().mockResolvedValue({ prepTasks: [] }),
  },
  preparations: {
    create: vi.fn(),
  },
  ratings: {
    getForPreparation: vi.fn().mockResolvedValue({ ratings: [] }),
    create: vi.fn(),
    delete: vi.fn(),
  },
  users: {
    list: vi.fn().mockResolvedValue({ users: [] }),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: (selector: (s: { user: { id: string } | null }) => unknown) =>
    selector({ user: { id: 'user-1' } }),
}));

vi.mock('@/components/PrepTaskList', () => ({
  PrepTaskList: () => <div data-testid="prep-task-list" />,
}));

vi.mock('@/components/PreparationPhotos', () => ({
  PreparationPhotos: () => <div data-testid="preparation-photos" />,
}));

vi.mock('@/components/StarRating', () => ({
  StarRating: () => <div data-testid="star-rating" />,
}));

vi.mock('@/components/Skeleton', () => ({
  SkeletonCard: () => <div data-testid="skeleton-card" />,
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('@/components/ErrorState', () => ({
  ErrorState: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('@/components/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

import { menus, preparations } from '@/lib/api';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const baseEntry = {
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
  createdAt: '2024-06-10T00:00:00.000Z',
  updatedAt: '2024-06-10T00:00:00.000Z',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TodayPage skip entry UI', () => {
  it('renders Skip button when entry is not completed and not skipped', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({ entry: { ...baseEntry } });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    const { findByRole } = render(<TodayPage />, { wrapper });
    const skipBtn = await findByRole('button', { name: /skip/i });
    expect(skipBtn).toBeTruthy();
  });

  it('does NOT render Skip button when entry is completed', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({
      entry: { ...baseEntry, completed: true },
    });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    const { findByText } = render(<TodayPage />, { wrapper });
    await findByText('Completed');
    expect(screen.queryByRole('button', { name: /skip this dinner entry/i })).toBeNull();
  });

  it('does NOT render Skip button when entry is already skipped', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({
      entry: { ...baseEntry, skipped: true },
    });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    const { findByText } = render(<TodayPage />, { wrapper });
    await findByText('Skipped');
    expect(screen.queryByRole('button', { name: /skip this dinner entry/i })).toBeNull();
  });

  it('shows Skipped status banner when skipped is true', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({
      entry: { ...baseEntry, skipped: true },
    });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    const { findByText } = render(<TodayPage />, { wrapper });
    expect(await findByText('Skipped')).toBeTruthy();
  });

  it('renders Unskip button when entry is skipped', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({
      entry: { ...baseEntry, skipped: true },
    });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    const { findByRole } = render(<TodayPage />, { wrapper });
    expect(await findByRole('button', { name: /unskip/i })).toBeTruthy();
  });

  it('does NOT render "I Made This!" button when entry is skipped', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({
      entry: { ...baseEntry, skipped: true },
    });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    const { findByText } = render(<TodayPage />, { wrapper });
    await findByText('Skipped');
    expect(screen.queryByText('I Made This!')).toBeNull();
  });
});

describe('TodayPage entry type display', () => {
  it('shows loading skeleton while fetching', () => {
    vi.mocked(menus.getToday).mockReturnValue(new Promise(() => {}));
    vi.mocked(menus.getWeek).mockReturnValue(new Promise(() => {}));
    render(<TodayPage />, { wrapper });
    expect(screen.getByTestId('skeleton-card')).toBeTruthy();
  });

  it('shows error state when fetch fails', async () => {
    vi.mocked(menus.getToday).mockRejectedValue(new Error('Network error'));
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    const { findByText } = render(<TodayPage />, { wrapper });
    expect(await findByText("Failed to load today's dinner")).toBeTruthy();
  });

  it('shows empty state when no entry for today', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({ entry: null });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    const { findByText } = render(<TodayPage />, { wrapper });
    expect(await findByText('No dinner planned')).toBeTruthy();
  });

  it('shows "Home Cooked" entry type label', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({ entry: { ...baseEntry, type: 'assembled' } });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    const { findByText } = render(<TodayPage />, { wrapper });
    expect(await findByText('Home Cooked')).toBeTruthy();
  });

  it('shows "Fend for Yourself" entry type', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({
      entry: { ...baseEntry, type: 'fend_for_self', mainDish: null },
    });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    const { findByText } = render(<TodayPage />, { wrapper });
    expect(await findByText("Everyone on their own tonight!")).toBeTruthy();
  });

  it('shows dining out entry type', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({
      entry: {
        ...baseEntry,
        type: 'dining_out',
        mainDish: null,
        restaurantName: 'The Grill',
      },
    });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    const { findByText } = render(<TodayPage />, { wrapper });
    expect(await findByText(/Dining Out: The Grill/)).toBeTruthy();
  });

  it('shows dining out type label without restaurant name', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({
      entry: { ...baseEntry, type: 'dining_out', mainDish: null },
    });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    render(<TodayPage />, { wrapper });
    // Multiple "Dining Out" texts are expected: type label + content
    const elements = await screen.findAllByText('Dining Out');
    expect(elements.length).toBeGreaterThan(0);
  });

  it('shows leftovers entry with source dish name', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({
      entry: {
        ...baseEntry,
        type: 'leftovers',
        mainDish: null,
        sourceEntryDishName: 'Chicken Tikka',
      },
    });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    const { findByText } = render(<TodayPage />, { wrapper });
    expect(await findByText('Leftovers from Chicken Tikka')).toBeTruthy();
  });

  it('shows generic leftovers without source dish name', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({
      entry: {
        ...baseEntry,
        type: 'leftovers',
        mainDish: null,
        sourceEntryDishName: null,
      },
    });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    render(<TodayPage />, { wrapper });
    // "Leftovers" appears as both type label and content text
    const elements = await screen.findAllByText('Leftovers');
    expect(elements.length).toBeGreaterThan(0);
  });

  it('shows custom text entry', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({
      entry: { ...baseEntry, type: 'custom', mainDish: null, customText: 'Homemade Pizza' },
    });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    const { findByText } = render(<TodayPage />, { wrapper });
    expect(await findByText('Homemade Pizza')).toBeTruthy();
  });

  it('shows "No dish selected yet" for assembled entry with no main dish', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({
      entry: { ...baseEntry, type: 'assembled', mainDish: null },
    });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    const { findByText } = render(<TodayPage />, { wrapper });
    expect(await findByText('No dish selected yet')).toBeTruthy();
  });

  it('shows side dishes with main dish', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({
      entry: {
        ...baseEntry,
        sideDishes: [{ id: 'side-1', name: 'Salad', type: 'side' }],
      },
    });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    const { findByText } = render(<TodayPage />, { wrapper });
    expect(await findByText(/with Salad/)).toBeTruthy();
  });

  it('shows "Not yet prepared" status banner', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({ entry: { ...baseEntry } });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    const { findByText } = render(<TodayPage />, { wrapper });
    expect(await findByText('Not yet prepared')).toBeTruthy();
  });

  it('shows "Completed" status banner when entry is completed', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({
      entry: { ...baseEntry, completed: true },
    });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    const { findByText } = render(<TodayPage />, { wrapper });
    expect(await findByText('Completed')).toBeTruthy();
  });

  it('shows "I Made This!" button for uncompleted assembled entry with main dish', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({ entry: { ...baseEntry } });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    const { findByText } = render(<TodayPage />, { wrapper });
    expect(await findByText('I Made This!')).toBeTruthy();
  });

  it('shows dining out restaurant notes', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({
      entry: {
        ...baseEntry,
        type: 'dining_out',
        mainDish: null,
        restaurantName: 'Thai Place',
        restaurantNotes: 'Reservation at 7pm',
      },
    });
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
    const { findByText } = render(<TodayPage />, { wrapper });
    expect(await findByText('Reservation at 7pm')).toBeTruthy();
  });
});

// Need to import users from the already-mocked module
import { users as usersApi } from '@/lib/api';

describe('TodayPage prep form', () => {
  const mockUsers = [
    { id: 'user-1', username: 'alice', displayName: 'Alice', role: 'user' as const },
    { id: 'user-2', username: 'bob', displayName: 'Bob', role: 'user' as const },
  ];

  beforeEach(() => {
    vi.mocked(menus.getWeek).mockResolvedValue({
      menu: { weekStartDate: '2024-06-10', entries: [] },
    });
  });

  it('shows prep form when I Made This! clicked', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({ entry: { ...baseEntry } });
    vi.mocked(usersApi.list).mockResolvedValue({ users: mockUsers });
    render(<TodayPage />, { wrapper });
    const madeThisBtn = await screen.findByText('I Made This!');
    fireEvent.click(madeThisBtn);
    expect(await screen.findByText('Who cooked?')).toBeTruthy();
  });

  it('shows user buttons in prep form', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({ entry: { ...baseEntry } });
    vi.mocked(usersApi.list).mockResolvedValue({ users: mockUsers });
    render(<TodayPage />, { wrapper });
    const madeThisBtn = await screen.findByText('I Made This!');
    fireEvent.click(madeThisBtn);
    await screen.findByText('Who cooked?');
    expect(screen.getByRole('button', { name: 'Alice' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bob' })).toBeTruthy();
  });

  it('shows Log Preparation button in prep form', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({ entry: { ...baseEntry } });
    vi.mocked(usersApi.list).mockResolvedValue({ users: mockUsers });
    render(<TodayPage />, { wrapper });
    const madeThisBtn = await screen.findByText('I Made This!');
    fireEvent.click(madeThisBtn);
    await screen.findByText('Who cooked?');
    expect(screen.getByRole('button', { name: 'Log Preparation' })).toBeTruthy();
  });

  it('shows Cancel button in prep form', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({ entry: { ...baseEntry } });
    vi.mocked(usersApi.list).mockResolvedValue({ users: mockUsers });
    render(<TodayPage />, { wrapper });
    const madeThisBtn = await screen.findByText('I Made This!');
    fireEvent.click(madeThisBtn);
    await screen.findByText('Who cooked?');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('dismisses prep form when Cancel clicked', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({ entry: { ...baseEntry } });
    vi.mocked(usersApi.list).mockResolvedValue({ users: mockUsers });
    render(<TodayPage />, { wrapper });
    const madeThisBtn = await screen.findByText('I Made This!');
    fireEvent.click(madeThisBtn);
    await screen.findByText('Who cooked?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByText('Who cooked?')).toBeNull();
    });
  });

  it('calls preparations.create when Log Preparation clicked with preparer selected', async () => {
    vi.mocked(menus.getToday).mockResolvedValue({ entry: { ...baseEntry } });
    vi.mocked(usersApi.list).mockResolvedValue({ users: mockUsers });
    vi.mocked(preparations.create).mockResolvedValue({ preparation: { id: 'prep-1' } } as never);
    render(<TodayPage />, { wrapper });
    const madeThisBtn = await screen.findByText('I Made This!');
    fireEvent.click(madeThisBtn);
    await screen.findByText('Who cooked?');
    // Select Alice as preparer
    fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log Preparation' }));
    await waitFor(() => {
      expect(preparations.create).toHaveBeenCalledWith(
        expect.objectContaining({
          dinnerEntryId: 'entry-1',
          preparerIds: ['user-1'],
        })
      );
    });
  });
});
