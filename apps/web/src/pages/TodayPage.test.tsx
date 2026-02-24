import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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

import { menus } from '@/lib/api';

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
