import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RatingForm } from './RatingForm';

vi.mock('@/lib/api', () => ({
  ratings: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { ratings } from '../lib/api';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const existingRating = {
  id: 'rating-1',
  preparationId: 'prep-1',
  userId: 'user-1',
  userName: 'Alice',
  stars: 4,
  note: 'Great meal',
  createdAt: '2024-01-01T00:00:00Z',
};

describe('RatingForm', () => {
  describe('non-owner display mode', () => {
    it('shows username for non-owner rating', () => {
      render(
        <RatingForm
          preparationId="prep-1"
          existingRating={existingRating}
          currentUserId="other-user"
        />,
        { wrapper }
      );
      expect(screen.getByText('Alice')).toBeTruthy();
    });

    it('shows note for non-owner rating', () => {
      render(
        <RatingForm
          preparationId="prep-1"
          existingRating={existingRating}
          currentUserId="other-user"
        />,
        { wrapper }
      );
      expect(screen.getByText(/Great meal/)).toBeTruthy();
    });

    it('does not show edit button for non-owner', () => {
      render(
        <RatingForm
          preparationId="prep-1"
          existingRating={existingRating}
          currentUserId="other-user"
        />,
        { wrapper }
      );
      expect(screen.queryByTitle('Edit')).toBeNull();
    });
  });

  describe('owner display mode (not editing)', () => {
    it('shows edit and delete buttons for owner', () => {
      render(
        <RatingForm
          preparationId="prep-1"
          existingRating={existingRating}
          currentUserId="user-1"
        />,
        { wrapper }
      );
      expect(screen.getByTitle('Edit')).toBeTruthy();
      expect(screen.getByTitle('Delete')).toBeTruthy();
    });

    it('shows note in display mode', () => {
      render(
        <RatingForm
          preparationId="prep-1"
          existingRating={existingRating}
          currentUserId="user-1"
        />,
        { wrapper }
      );
      expect(screen.getByText('Great meal')).toBeTruthy();
    });

    it('switches to edit mode when edit button clicked', () => {
      render(
        <RatingForm
          preparationId="prep-1"
          existingRating={existingRating}
          currentUserId="user-1"
        />,
        { wrapper }
      );
      fireEvent.click(screen.getByTitle('Edit'));
      // In edit mode shows a note input
      expect(screen.getByPlaceholderText('Add a note (optional)')).toBeTruthy();
    });

    it('calls ratings.delete when delete button clicked', async () => {
      vi.mocked(ratings.delete).mockResolvedValue(undefined as never);
      render(
        <RatingForm
          preparationId="prep-1"
          existingRating={existingRating}
          currentUserId="user-1"
        />,
        { wrapper }
      );
      fireEvent.click(screen.getByTitle('Delete'));
      await waitFor(() => {
        expect(ratings.delete).toHaveBeenCalledWith('rating-1');
      });
    });
  });

  describe('edit mode (owner editing existing rating)', () => {
    it('shows save and cancel buttons when editing', () => {
      render(
        <RatingForm
          preparationId="prep-1"
          existingRating={existingRating}
          currentUserId="user-1"
        />,
        { wrapper }
      );
      fireEvent.click(screen.getByTitle('Edit'));
      expect(screen.getByTitle('Save')).toBeTruthy();
      expect(screen.getByTitle('Cancel')).toBeTruthy();
    });

    it('calls ratings.update when save submitted', async () => {
      vi.mocked(ratings.update).mockResolvedValue({ rating: existingRating } as never);
      render(
        <RatingForm
          preparationId="prep-1"
          existingRating={existingRating}
          currentUserId="user-1"
        />,
        { wrapper }
      );
      fireEvent.click(screen.getByTitle('Edit'));
      // Stars default to existingRating.stars = 4, so submit is enabled
      fireEvent.click(screen.getByTitle('Save'));
      await waitFor(() => {
        expect(ratings.update).toHaveBeenCalledWith('rating-1', {
          stars: 4,
          note: 'Great meal',
        });
      });
    });

    it('resets to existing values when cancel clicked', () => {
      render(
        <RatingForm
          preparationId="prep-1"
          existingRating={existingRating}
          currentUserId="user-1"
        />,
        { wrapper }
      );
      fireEvent.click(screen.getByTitle('Edit'));
      // Change note
      const input = screen.getByPlaceholderText('Add a note (optional)');
      fireEvent.change(input, { target: { value: 'Changed note' } });
      fireEvent.click(screen.getByTitle('Cancel'));
      // Should be back in display mode showing original note
      expect(screen.getByText('Great meal')).toBeTruthy();
    });
  });

  describe('create mode (no existing rating)', () => {
    it('shows Rate button when no existing rating', () => {
      render(<RatingForm preparationId="prep-1" currentUserId="user-1" />, { wrapper });
      expect(screen.getByRole('button', { name: 'Rate' })).toBeTruthy();
    });

    it('shows note input in create mode', () => {
      render(<RatingForm preparationId="prep-1" currentUserId="user-1" />, { wrapper });
      expect(screen.getByPlaceholderText('Add a note (optional)')).toBeTruthy();
    });

    it('Rate button is disabled when stars = 0', () => {
      render(<RatingForm preparationId="prep-1" currentUserId="user-1" />, { wrapper });
      const rateBtn = screen.getByRole('button', { name: 'Rate' });
      expect((rateBtn as HTMLButtonElement).disabled).toBe(true);
    });

    it('does NOT call create when stars = 0 and form submitted', async () => {
      render(<RatingForm preparationId="prep-1" currentUserId="user-1" />, { wrapper });
      const form = screen.getByRole('button', { name: 'Rate' }).closest('form')!;
      fireEvent.submit(form);
      expect(ratings.create).not.toHaveBeenCalled();
    });

    it('calls ratings.create when stars > 0 and form submitted', async () => {
      vi.mocked(ratings.create).mockResolvedValue({ rating: existingRating } as never);
      render(<RatingForm preparationId="prep-1" currentUserId="user-1" />, { wrapper });
      // Click the 3rd star button (value 3)
      const starButtons = screen
        .getAllByRole('button')
        .filter((b) => !b.textContent?.includes('Rate'));
      fireEvent.click(starButtons[2]);
      fireEvent.click(screen.getByRole('button', { name: 'Rate' }));
      await waitFor(() => {
        expect(ratings.create).toHaveBeenCalledWith('prep-1', { stars: 3, note: undefined });
      });
    });

    it('calls onRatingCreated after successful create', async () => {
      vi.mocked(ratings.create).mockResolvedValue({ rating: existingRating } as never);
      const onRatingCreated = vi.fn();
      render(
        <RatingForm
          preparationId="prep-1"
          currentUserId="user-1"
          onRatingCreated={onRatingCreated}
        />,
        { wrapper }
      );
      const starButtons = screen
        .getAllByRole('button')
        .filter((b) => !b.textContent?.includes('Rate'));
      fireEvent.click(starButtons[2]);
      fireEvent.click(screen.getByRole('button', { name: 'Rate' }));
      await waitFor(() => {
        expect(onRatingCreated).toHaveBeenCalled();
      });
    });

    it('shows Saving... while loading', async () => {
      vi.mocked(ratings.create).mockReturnValue(new Promise(() => {}) as never);
      render(<RatingForm preparationId="prep-1" currentUserId="user-1" />, { wrapper });
      const starButtons = screen
        .getAllByRole('button')
        .filter((b) => !b.textContent?.includes('Rate'));
      fireEvent.click(starButtons[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Rate' }));
      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeTruthy();
      });
    });
  });

  describe('note handling', () => {
    it('passes note as undefined when empty string', async () => {
      vi.mocked(ratings.create).mockResolvedValue({ rating: existingRating } as never);
      render(<RatingForm preparationId="prep-1" currentUserId="user-1" />, { wrapper });
      const starButtons = screen
        .getAllByRole('button')
        .filter((b) => !b.textContent?.includes('Rate'));
      fireEvent.click(starButtons[0]);
      // Leave note empty
      fireEvent.click(screen.getByRole('button', { name: 'Rate' }));
      await waitFor(() => {
        expect(ratings.create).toHaveBeenCalledWith('prep-1', { stars: 1, note: undefined });
      });
    });

    it('passes note string when note has value', async () => {
      vi.mocked(ratings.create).mockResolvedValue({ rating: existingRating } as never);
      render(<RatingForm preparationId="prep-1" currentUserId="user-1" />, { wrapper });
      const starButtons = screen
        .getAllByRole('button')
        .filter((b) => !b.textContent?.includes('Rate'));
      fireEvent.click(starButtons[0]);
      const noteInput = screen.getByPlaceholderText('Add a note (optional)');
      fireEvent.change(noteInput, { target: { value: 'Delicious!' } });
      fireEvent.click(screen.getByRole('button', { name: 'Rate' }));
      await waitFor(() => {
        expect(ratings.create).toHaveBeenCalledWith('prep-1', { stars: 1, note: 'Delicious!' });
      });
    });
  });
});
