import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DishNotes } from './DishNotes';

const { mockUser } = vi.hoisted(() => ({
  mockUser: { id: 'user-1', username: 'alice', displayName: 'Alice', role: 'user' as const },
}));

vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn((selector: (s: { user: typeof mockUser }) => unknown) =>
    selector({ user: mockUser })
  ),
}));

vi.mock('@/lib/api', () => ({
  dishNotes: {
    list: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { dishNotes } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.mocked(useAuthStore).mockImplementation(
    (selector: (s: { user: typeof mockUser }) => unknown) => selector({ user: mockUser })
  );
});

const mockNotes = [
  {
    id: 'note-1',
    dishId: 'dish-1',
    note: 'Needs more salt',
    createdById: 'user-1',
    createdByUsername: 'alice',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'note-2',
    dishId: 'dish-1',
    note: "Great recipe",
    createdById: 'user-2',
    createdByUsername: 'bob',
    createdAt: new Date().toISOString(),
  },
];

describe('DishNotes', () => {
  describe('loading state', () => {
    it('shows loading indicator while loading', () => {
      vi.mocked(dishNotes.list).mockReturnValue(new Promise(() => {}));
      render(<DishNotes dishId="dish-1" />, { wrapper });
      expect(screen.getByText('Loading notes...')).toBeTruthy();
    });
  });

  describe('empty state', () => {
    it('shows empty message when no notes', async () => {
      vi.mocked(dishNotes.list).mockResolvedValue({ notes: [] });
      render(<DishNotes dishId="dish-1" />, { wrapper });
      expect(await screen.findByText(/No notes yet/)).toBeTruthy();
    });
  });

  describe('with notes', () => {
    it('renders note text', async () => {
      vi.mocked(dishNotes.list).mockResolvedValue({ notes: mockNotes });
      render(<DishNotes dishId="dish-1" />, { wrapper });
      expect(await screen.findByText('Needs more salt')).toBeTruthy();
      expect(screen.getByText('Great recipe')).toBeTruthy();
    });

    it('shows delete button only for own notes', async () => {
      vi.mocked(dishNotes.list).mockResolvedValue({ notes: mockNotes });
      render(<DishNotes dishId="dish-1" />, { wrapper });
      await screen.findByText('Needs more salt');
      const deleteBtns = screen.getAllByRole('button', { name: /Delete note/i });
      // Only user-1's note has a delete button (user-1 is current user)
      expect(deleteBtns).toHaveLength(1);
      expect(deleteBtns[0]).toHaveAttribute('aria-label', 'Delete note by alice');
    });

    it('calls dishNotes.delete when delete button clicked', async () => {
      vi.mocked(dishNotes.list).mockResolvedValue({ notes: mockNotes });
      vi.mocked(dishNotes.delete).mockResolvedValue(undefined as never);
      render(<DishNotes dishId="dish-1" />, { wrapper });
      await screen.findByText('Needs more salt');
      fireEvent.click(screen.getByRole('button', { name: /Delete note by alice/i }));
      await waitFor(() => {
        expect(dishNotes.delete).toHaveBeenCalledWith('note-1');
      });
    });

    it('shows username and relative date', async () => {
      vi.mocked(dishNotes.list).mockResolvedValue({ notes: mockNotes });
      render(<DishNotes dishId="dish-1" />, { wrapper });
      await screen.findByText('Needs more salt');
      // Should show username
      expect(screen.getByText(/alice/)).toBeTruthy();
    });
  });

  describe('adding notes', () => {
    it('renders Cook Notes heading and textarea', async () => {
      vi.mocked(dishNotes.list).mockResolvedValue({ notes: [] });
      render(<DishNotes dishId="dish-1" />, { wrapper });
      expect(screen.getByText('Cook Notes')).toBeTruthy();
      expect(await screen.findByLabelText('Cook note')).toBeTruthy();
    });

    it('renders Add note button', async () => {
      vi.mocked(dishNotes.list).mockResolvedValue({ notes: [] });
      render(<DishNotes dishId="dish-1" />, { wrapper });
      expect(await screen.findByRole('button', { name: 'Add note' })).toBeTruthy();
    });

    it('Add note button disabled when textarea is empty', async () => {
      vi.mocked(dishNotes.list).mockResolvedValue({ notes: [] });
      render(<DishNotes dishId="dish-1" />, { wrapper });
      const btn = await screen.findByRole('button', { name: 'Add note' });
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });

    it('Add note button enabled when text entered', async () => {
      vi.mocked(dishNotes.list).mockResolvedValue({ notes: [] });
      render(<DishNotes dishId="dish-1" />, { wrapper });
      const textarea = await screen.findByLabelText('Cook note');
      await userEvent.type(textarea, 'My note');
      const btn = screen.getByRole('button', { name: 'Add note' });
      expect((btn as HTMLButtonElement).disabled).toBe(false);
    });

    it('calls dishNotes.create with trimmed text on submit', async () => {
      vi.mocked(dishNotes.list).mockResolvedValue({ notes: [] });
      vi.mocked(dishNotes.create).mockResolvedValue({ note: mockNotes[0] } as never);
      render(<DishNotes dishId="dish-1" />, { wrapper });
      const textarea = await screen.findByLabelText('Cook note');
      await userEvent.type(textarea, '  My note  ');
      fireEvent.submit(textarea.closest('form')!);
      await waitFor(() => {
        expect(dishNotes.create).toHaveBeenCalledWith('dish-1', 'My note');
      });
    });

    it('does NOT call create when textarea is only whitespace', async () => {
      vi.mocked(dishNotes.list).mockResolvedValue({ notes: [] });
      render(<DishNotes dishId="dish-1" />, { wrapper });
      const textarea = await screen.findByLabelText('Cook note');
      await userEvent.type(textarea, '   ');
      fireEvent.submit(textarea.closest('form')!);
      expect(dishNotes.create).not.toHaveBeenCalled();
    });
  });

  describe('relative date formatting', () => {
    it('shows "today" for notes created today', async () => {
      const todayNote = [{ ...mockNotes[0], createdAt: new Date().toISOString() }];
      vi.mocked(dishNotes.list).mockResolvedValue({ notes: todayNote });
      render(<DishNotes dishId="dish-1" />, { wrapper });
      await screen.findByText('Needs more salt');
      expect(screen.getByText(/today/)).toBeTruthy();
    });

    it('shows "yesterday" for notes from yesterday', async () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const yesterdayNote = [{ ...mockNotes[0], createdAt: yesterday }];
      vi.mocked(dishNotes.list).mockResolvedValue({ notes: yesterdayNote });
      render(<DishNotes dishId="dish-1" />, { wrapper });
      await screen.findByText('Needs more salt');
      expect(screen.getByText(/yesterday/)).toBeTruthy();
    });
  });
});
