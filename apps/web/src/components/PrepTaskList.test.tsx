import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PrepTaskList } from './PrepTaskList';

vi.mock('@/lib/api', () => ({
  prepTasks: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { prepTasks } from '@/lib/api';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PrepTaskList', () => {
  describe('loading state', () => {
    it('shows skeleton while loading', () => {
      vi.mocked(prepTasks.list).mockReturnValue(new Promise(() => {}));
      const { container } = render(<PrepTaskList entryId="entry-1" />, { wrapper });
      // Skeleton divs rendered during loading
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('empty state', () => {
    it('shows add task input when no tasks', async () => {
      vi.mocked(prepTasks.list).mockResolvedValue({ prepTasks: [] });
      render(<PrepTaskList entryId="entry-1" />, { wrapper });
      expect(await screen.findByPlaceholderText(/prep task/i)).toBeTruthy();
    });
  });

  describe('with tasks', () => {
    const mockTasks = [
      { id: 'task-1', description: 'Chop onions', completed: false, entryId: 'entry-1' },
      { id: 'task-2', description: 'Boil water', completed: true, entryId: 'entry-1' },
    ];

    it('renders tasks from API', async () => {
      vi.mocked(prepTasks.list).mockResolvedValue({ prepTasks: mockTasks });
      render(<PrepTaskList entryId="entry-1" />, { wrapper });
      expect(await screen.findByText('Chop onions')).toBeTruthy();
      expect(screen.getByText('Boil water')).toBeTruthy();
    });

    it('shows checkbox for each task', async () => {
      vi.mocked(prepTasks.list).mockResolvedValue({ prepTasks: mockTasks });
      render(<PrepTaskList entryId="entry-1" />, { wrapper });
      await screen.findByText('Chop onions');
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(2);
    });

    it('completed task checkbox is checked', async () => {
      vi.mocked(prepTasks.list).mockResolvedValue({ prepTasks: mockTasks });
      render(<PrepTaskList entryId="entry-1" />, { wrapper });
      await screen.findByText('Boil water');
      const checkboxes = screen.getAllByRole('checkbox');
      // Second task is completed
      expect((checkboxes[1] as HTMLInputElement).checked).toBe(true);
    });

    it('calls prepTasks.update when checkbox toggled', async () => {
      vi.mocked(prepTasks.list).mockResolvedValue({ prepTasks: mockTasks });
      vi.mocked(prepTasks.update).mockResolvedValue({ prepTask: { ...mockTasks[0], completed: true } });
      render(<PrepTaskList entryId="entry-1" />, { wrapper });
      await screen.findByText('Chop onions');
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[0]);
      await waitFor(() => {
        expect(prepTasks.update).toHaveBeenCalledWith('task-1', { completed: true });
      });
    });

    it('calls prepTasks.delete when delete button clicked', async () => {
      vi.mocked(prepTasks.list).mockResolvedValue({ prepTasks: mockTasks });
      vi.mocked(prepTasks.delete).mockResolvedValue(undefined as never);
      render(<PrepTaskList entryId="entry-1" />, { wrapper });
      await screen.findByText('Chop onions');
      const deleteBtn = screen.getByRole('button', { name: /Delete prep task: Chop onions/i });
      fireEvent.click(deleteBtn);
      await waitFor(() => {
        expect(prepTasks.delete).toHaveBeenCalledWith('task-1');
      });
    });
  });

  describe('adding tasks', () => {
    it('calls prepTasks.create when form submitted with text', async () => {
      vi.mocked(prepTasks.list).mockResolvedValue({ prepTasks: [] });
      vi.mocked(prepTasks.create).mockResolvedValue({
        prepTask: { id: 'task-new', description: 'New task', completed: false, entryId: 'entry-1' },
      });
      render(<PrepTaskList entryId="entry-1" />, { wrapper });
      const input = await screen.findByPlaceholderText(/prep task/i);
      await userEvent.type(input, 'New task');
      fireEvent.submit(input.closest('form')!);
      await waitFor(() => {
        expect(prepTasks.create).toHaveBeenCalledWith('entry-1', 'New task');
      });
    });

    it('does NOT call create when input is empty', async () => {
      vi.mocked(prepTasks.list).mockResolvedValue({ prepTasks: [] });
      render(<PrepTaskList entryId="entry-1" />, { wrapper });
      const input = await screen.findByPlaceholderText(/prep task/i);
      fireEvent.submit(input.closest('form')!);
      expect(prepTasks.create).not.toHaveBeenCalled();
    });

    it('does NOT call create when input is only whitespace', async () => {
      vi.mocked(prepTasks.list).mockResolvedValue({ prepTasks: [] });
      render(<PrepTaskList entryId="entry-1" />, { wrapper });
      const input = await screen.findByPlaceholderText(/prep task/i);
      await userEvent.type(input, '   ');
      fireEvent.submit(input.closest('form')!);
      expect(prepTasks.create).not.toHaveBeenCalled();
    });
  });
});
