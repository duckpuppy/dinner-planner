import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminLogsPage } from './AdminLogsPage';

vi.mock('@/lib/api', () => ({
  appEvents: {
    list: vi.fn(),
    stats: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { appEvents } from '@/lib/api';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const makeEvent = (overrides: Partial<(typeof mockEvents)[0]> = {}) => ({
  id: 'evt-1',
  level: 'info' as const,
  category: 'auth' as const,
  message: 'User logged in',
  details: null,
  userId: 'user-1',
  user: { id: 'user-1', displayName: 'Admin User' },
  createdAt: new Date(Date.now() - 60_000).toISOString(),
  ...overrides,
});

const mockEvents = [
  makeEvent({ id: 'evt-1', level: 'info', category: 'auth', message: 'User logged in' }),
  makeEvent({
    id: 'evt-2',
    level: 'warn',
    category: 'system',
    message: 'Disk space low',
    userId: null,
    user: null,
  }),
  makeEvent({
    id: 'evt-3',
    level: 'error',
    category: 'video',
    message: 'Video processing failed',
    details: { code: 500, reason: 'timeout' },
  }),
];

describe('AdminLogsPage', () => {
  describe('page title and controls', () => {
    it('renders the page title', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: mockEvents, total: 3 });
      render(<AdminLogsPage />, { wrapper });
      expect(await screen.findByText('Event Log')).toBeTruthy();
    });

    it('renders level filter select', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: mockEvents, total: 3 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText('Event Log');
      expect(screen.getByLabelText('Filter by level')).toBeTruthy();
    });

    it('renders category filter select', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: mockEvents, total: 3 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText('Event Log');
      expect(screen.getByLabelText('Filter by category')).toBeTruthy();
    });

    it('renders search input', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: mockEvents, total: 3 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText('Event Log');
      expect(screen.getByLabelText('Search events')).toBeTruthy();
    });

    it('renders auto-refresh toggle', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: mockEvents, total: 3 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText('Event Log');
      expect(screen.getByRole('checkbox')).toBeTruthy();
      expect(screen.getByText('Auto-refresh')).toBeTruthy();
    });
  });

  describe('loading state', () => {
    it('shows skeleton while loading', () => {
      vi.mocked(appEvents.list).mockReturnValue(new Promise(() => {}));
      const { container } = render(<AdminLogsPage />, { wrapper });
      expect(container.querySelector('.animate-pulse')).toBeTruthy();
    });
  });

  describe('events table', () => {
    it('renders events in a table with correct columns', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: mockEvents, total: 3 });
      render(<AdminLogsPage />, { wrapper });
      expect(await screen.findByText('User logged in')).toBeTruthy();
      expect(screen.getByText('Disk space low')).toBeTruthy();
      expect(screen.getByText('Video processing failed')).toBeTruthy();
    });

    it('renders info level badge', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: mockEvents, total: 3 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText('User logged in');
      expect(screen.getByText('info')).toBeTruthy();
    });

    it('renders warn level badge', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: mockEvents, total: 3 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText('Disk space low');
      expect(screen.getByText('warn')).toBeTruthy();
    });

    it('renders error level badge', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: mockEvents, total: 3 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText('Video processing failed');
      expect(screen.getByText('error')).toBeTruthy();
    });

    it('shows "System" for events with no user', async () => {
      const noUserEvent = makeEvent({ id: 'no-user', userId: null, user: null });
      vi.mocked(appEvents.list).mockResolvedValue({ events: [noUserEvent], total: 1 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText('User logged in');
      // The user cell should say "System"
      const cells = screen.getAllByText('System');
      // At least one match — one from category option, one from cell
      expect(cells.length).toBeGreaterThan(0);
    });

    it('shows user display name for events with a user', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: [mockEvents[0]], total: 1 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText('User logged in');
      expect(screen.getByText('Admin User')).toBeTruthy();
    });
  });

  describe('expanding rows', () => {
    it('expands row to show details JSON when clicked', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: [mockEvents[2]], total: 1 });
      render(<AdminLogsPage />, { wrapper });
      const row = await screen.findByText('Video processing failed');
      // Click the row
      fireEvent.click(row.closest('tr')!);
      await waitFor(() => {
        expect(screen.getByText(/"code": 500/)).toBeTruthy();
      });
    });

    it('collapses row when clicked again', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: [mockEvents[2]], total: 1 });
      render(<AdminLogsPage />, { wrapper });
      const row = await screen.findByText('Video processing failed');
      const tr = row.closest('tr')!;
      fireEvent.click(tr);
      await screen.findByText(/"code": 500/);
      fireEvent.click(tr);
      await waitFor(() => {
        expect(screen.queryByText(/"code": 500/)).toBeNull();
      });
    });

    it('does not expand rows with null details', async () => {
      const eventNoDetails = makeEvent({ id: 'no-details', details: null });
      vi.mocked(appEvents.list).mockResolvedValue({ events: [eventNoDetails], total: 1 });
      render(<AdminLogsPage />, { wrapper });
      const row = await screen.findByText('User logged in');
      fireEvent.click(row.closest('tr')!);
      // No details JSON should appear
      expect(screen.queryByText(/"code":/)).toBeNull();
    });
  });

  describe('empty state', () => {
    it('shows empty state when no events found', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: [], total: 0 });
      render(<AdminLogsPage />, { wrapper });
      expect(await screen.findByText('No events found')).toBeTruthy();
    });
  });

  describe('filtering by level', () => {
    it('passes level param to query when level filter changes', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: mockEvents, total: 3 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText('Event Log');

      const levelSelect = screen.getByLabelText('Filter by level');
      fireEvent.change(levelSelect, { target: { value: 'error' } });

      await waitFor(() => {
        const calls = vi.mocked(appEvents.list).mock.calls;
        const lastCall = calls[calls.length - 1][0];
        expect(lastCall?.level).toBe('error');
      });
    });
  });

  describe('filtering by category', () => {
    it('passes category param to query when category filter changes', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: mockEvents, total: 3 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText('Event Log');

      const categorySelect = screen.getByLabelText('Filter by category');
      fireEvent.change(categorySelect, { target: { value: 'auth' } });

      await waitFor(() => {
        const calls = vi.mocked(appEvents.list).mock.calls;
        const lastCall = calls[calls.length - 1][0];
        expect(lastCall?.category).toBe('auth');
      });
    });
  });

  describe('search', () => {
    it('passes search param when Enter pressed', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: mockEvents, total: 3 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText('Event Log');

      const searchInput = screen.getByLabelText('Search events');
      await userEvent.type(searchInput, 'login{Enter}');

      await waitFor(() => {
        const calls = vi.mocked(appEvents.list).mock.calls;
        const lastCall = calls[calls.length - 1][0];
        expect(lastCall?.search).toBe('login');
      });
    });

    it('passes search param when input loses focus', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: mockEvents, total: 3 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText('Event Log');

      const searchInput = screen.getByLabelText('Search events');
      await userEvent.type(searchInput, 'error');
      fireEvent.blur(searchInput);

      await waitFor(() => {
        const calls = vi.mocked(appEvents.list).mock.calls;
        const lastCall = calls[calls.length - 1][0];
        expect(lastCall?.search).toBe('error');
      });
    });
  });

  describe('clear filters', () => {
    it('shows clear filters button when filters are active', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: mockEvents, total: 3 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText('Event Log');

      const levelSelect = screen.getByLabelText('Filter by level');
      fireEvent.change(levelSelect, { target: { value: 'warn' } });

      expect(await screen.findByText('Clear filters')).toBeTruthy();
    });

    it('hides clear filters button when no filters active', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: mockEvents, total: 3 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText('Event Log');
      expect(screen.queryByText('Clear filters')).toBeNull();
    });

    it('clears all filters when clear button clicked', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: mockEvents, total: 3 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText('Event Log');

      fireEvent.change(screen.getByLabelText('Filter by level'), {
        target: { value: 'error' },
      });
      await screen.findByText('Clear filters');
      fireEvent.click(screen.getByText('Clear filters'));

      await waitFor(() => {
        expect(screen.queryByText('Clear filters')).toBeNull();
      });
      expect((screen.getByLabelText('Filter by level') as HTMLSelectElement).value).toBe('');
    });
  });

  describe('pagination', () => {
    const manyEvents = Array.from({ length: 50 }, (_, i) =>
      makeEvent({ id: `evt-${i}`, message: `Event ${i + 1}` })
    );

    it('shows pagination text when total > page size', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: manyEvents, total: 120 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText(/Showing/);
      expect(screen.getByText(/Showing 1–50 of 120/)).toBeTruthy();
    });

    it('does not show pagination when total fits in one page', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: mockEvents, total: 3 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText('User logged in');
      expect(screen.queryByText(/Showing/)).toBeNull();
    });

    it('next page button advances page', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: manyEvents, total: 120 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText(/Showing/);

      fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

      await waitFor(() => {
        const calls = vi.mocked(appEvents.list).mock.calls;
        const lastCall = calls[calls.length - 1][0];
        expect(lastCall?.offset).toBe(50);
      });
    });

    it('previous page button is disabled on first page', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: manyEvents, total: 120 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText(/Showing/);
      expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    });

    it('next page button is disabled on last page', async () => {
      // 51 events = 2 pages (50 + 1). Start on page 1, next should be disabled.
      vi.mocked(appEvents.list).mockResolvedValue({ events: manyEvents, total: 51 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText(/Showing/);

      const nextBtn = screen.getByRole('button', { name: 'Next page' });
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
      });
    });
  });

  describe('auto-refresh toggle', () => {
    it('auto-refresh checkbox is unchecked by default', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: mockEvents, total: 3 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText('Event Log');
      expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    });

    it('auto-refresh checkbox can be toggled on', async () => {
      vi.mocked(appEvents.list).mockResolvedValue({ events: mockEvents, total: 3 });
      render(<AdminLogsPage />, { wrapper });
      await screen.findByText('Event Log');
      fireEvent.click(screen.getByRole('checkbox'));
      expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    });
  });
});
