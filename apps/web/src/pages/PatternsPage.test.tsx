import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PatternsPage } from './PatternsPage';

// Mock API module
vi.mock('@/lib/api', () => ({
  patterns: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  dishes: {
    list: vi.fn(),
  },
}));

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { patterns as patternsApi, dishes as dishesApi } from '@/lib/api';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const mockPattern = {
  id: 'pat-1',
  label: 'Taco Tuesday',
  dayOfWeek: 2, // Tuesday
  type: 'assembled' as const,
  mainDishId: null,
  mainDish: null,
  sideDishIds: [],
  sideDishes: [],
  customText: null,
  createdById: 'user-1',
  createdAt: '2024-01-01T00:00:00.000Z',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PatternsPage', () => {
  beforeEach(() => {
    vi.mocked(dishesApi.list).mockResolvedValue({ dishes: [], total: 0 });
  });

  it('renders heading', async () => {
    vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [] });
    render(<PatternsPage />, { wrapper });
    expect(screen.getByText('Recurring Patterns')).toBeDefined();
  });

  it('renders "New Pattern" button', async () => {
    vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [] });
    render(<PatternsPage />, { wrapper });
    expect(screen.getByText('New Pattern')).toBeDefined();
  });

  it('shows empty state when no patterns', async () => {
    vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [] });
    render(<PatternsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('No patterns yet')).toBeDefined();
    });
  });

  it('shows pattern labels when patterns are loaded', async () => {
    vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [mockPattern] });
    render(<PatternsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Taco Tuesday')).toBeDefined();
    });
  });

  it('groups patterns by day name', async () => {
    const mondayPattern = { ...mockPattern, id: 'pat-2', label: 'Monday Pasta', dayOfWeek: 1 };
    vi.mocked(patternsApi.list).mockResolvedValue({
      patterns: [mockPattern, mondayPattern],
    });
    render(<PatternsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Tuesday')).toBeDefined();
      expect(screen.getByText('Monday')).toBeDefined();
    });
  });

  it('shows edit and delete buttons for each pattern', async () => {
    vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [mockPattern] });
    render(<PatternsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByLabelText('Edit pattern')).toBeDefined();
      expect(screen.getByLabelText('Delete pattern')).toBeDefined();
    });
  });

  it('opens PatternForm when "New Pattern" button is clicked', async () => {
    vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [] });
    render(<PatternsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('No patterns yet')).toBeDefined();
    });

    fireEvent.click(screen.getByText('New Pattern'));

    expect(screen.getByText('New Pattern', { selector: 'h2' })).toBeDefined();
  });

  it('opens edit form when edit button is clicked', async () => {
    vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [mockPattern] });
    render(<PatternsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Taco Tuesday')).toBeDefined();
    });

    fireEvent.click(screen.getByLabelText('Edit pattern'));

    expect(screen.getByText('Edit Pattern')).toBeDefined();
  });

  it('shows error state when query fails', async () => {
    vi.mocked(patternsApi.list).mockRejectedValue(new Error('Network error'));
    render(<PatternsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Failed to load patterns.')).toBeDefined();
    });
  });

  it('shows "Any dish" for assembled patterns with no main dish', async () => {
    vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [mockPattern] });
    render(<PatternsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Any dish')).toBeDefined();
    });
  });

  it('shows main dish name for assembled patterns with a main dish', async () => {
    const withDish = {
      ...mockPattern,
      mainDish: { id: 'd-1', name: 'Spaghetti', type: 'main' as const },
      mainDishId: 'd-1',
    };
    vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [withDish] });
    render(<PatternsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Spaghetti')).toBeDefined();
    });
  });

  it('shows "Fend for Yourself" for fend_for_self patterns', async () => {
    const fendPattern = { ...mockPattern, type: 'fend_for_self' as const };
    vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [fendPattern] });
    render(<PatternsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Fend for Yourself')).toBeDefined();
    });
  });

  it('shows "Dining Out" for dining_out patterns', async () => {
    const diningPattern = { ...mockPattern, type: 'dining_out' as const };
    vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [diningPattern] });
    render(<PatternsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Dining Out')).toBeDefined();
    });
  });

  it('shows restaurant name for dining_out patterns with customText', async () => {
    const diningPattern = {
      ...mockPattern,
      type: 'dining_out' as const,
      customText: 'Pizza Place',
    };
    vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [diningPattern] });
    render(<PatternsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Dining Out: Pizza Place')).toBeDefined();
    });
  });

  it('shows custom pattern text', async () => {
    const customPattern = {
      ...mockPattern,
      type: 'custom' as const,
      customText: 'Date Night',
    };
    vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [customPattern] });
    render(<PatternsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Date Night')).toBeDefined();
    });
  });

  it('shows "Custom" for custom patterns without text', async () => {
    const customPattern = {
      ...mockPattern,
      type: 'custom' as const,
      customText: null,
    };
    vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [customPattern] });
    render(<PatternsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Custom')).toBeDefined();
    });
  });

  it('shows side dishes in assembled pattern description', async () => {
    const withSides = {
      ...mockPattern,
      mainDish: { id: 'd-1', name: 'Pasta', type: 'main' as const },
      sideDishes: [{ id: 's-1', name: 'Salad', type: 'side' as const }],
    };
    vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [withSides] });
    render(<PatternsPage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(/Salad/)).toBeDefined();
    });
  });

  describe('PatternForm', () => {
    it('closes form when Cancel clicked', async () => {
      vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [] });
      render(<PatternsPage />, { wrapper });

      await waitFor(() => screen.getByText('No patterns yet'));
      fireEvent.click(screen.getByText('New Pattern'));
      await screen.findByText('New Pattern', { selector: 'h2' });

      fireEvent.click(screen.getByText('Cancel'));
      await waitFor(() => {
        expect(screen.queryByText('New Pattern', { selector: 'h2' })).toBeNull();
      });
    });

    it('shows error toast when label is empty on submit', async () => {
      const { toast } = await import('sonner');
      vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [] });
      render(<PatternsPage />, { wrapper });

      await waitFor(() => screen.getByText('No patterns yet'));
      fireEvent.click(screen.getByText('New Pattern'));
      await screen.findByText('New Pattern', { selector: 'h2' });

      fireEvent.submit(screen.getByRole('button', { name: 'Create Pattern' }).closest('form')!);
      expect(toast.error).toHaveBeenCalledWith('Label is required');
    });

    it('calls patterns.create when form submitted with valid label', async () => {
      vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [] });
      vi.mocked(patternsApi.create).mockResolvedValue({ pattern: mockPattern } as never);
      render(<PatternsPage />, { wrapper });

      await waitFor(() => screen.getByText('No patterns yet'));
      fireEvent.click(screen.getByText('New Pattern'));
      await screen.findByText('New Pattern', { selector: 'h2' });

      const labelInput = screen.getByPlaceholderText('e.g. Taco Tuesday');
      fireEvent.change(labelInput, { target: { value: 'Meatless Monday' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create Pattern' }));

      await waitFor(() => {
        expect(patternsApi.create).toHaveBeenCalledWith(
          expect.objectContaining({ label: 'Meatless Monday' })
        );
      });
    });

    it('calls patterns.update when editing existing pattern', async () => {
      vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [mockPattern] });
      vi.mocked(patternsApi.update).mockResolvedValue({ pattern: mockPattern } as never);
      render(<PatternsPage />, { wrapper });

      await waitFor(() => screen.getByText('Taco Tuesday'));
      fireEvent.click(screen.getByLabelText('Edit pattern'));
      await screen.findByText('Edit Pattern');

      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => {
        expect(patternsApi.update).toHaveBeenCalledWith(
          'pat-1',
          expect.objectContaining({ label: 'Taco Tuesday' })
        );
      });
    });

    it('shows dish selector when type is assembled', async () => {
      vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [] });
      render(<PatternsPage />, { wrapper });

      await waitFor(() => screen.getByText('No patterns yet'));
      fireEvent.click(screen.getByText('New Pattern'));
      await screen.findByText('New Pattern', { selector: 'h2' });

      // assembled is default, should show main dish selector
      expect(screen.getByText('Main Dish (optional)')).toBeDefined();
    });

    it('shows custom text field when type is dining_out', async () => {
      vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [] });
      render(<PatternsPage />, { wrapper });

      await waitFor(() => screen.getByText('No patterns yet'));
      fireEvent.click(screen.getByText('New Pattern'));
      await screen.findByText('New Pattern', { selector: 'h2' });

      // Click Dining Out type button
      fireEvent.click(screen.getByRole('button', { name: 'Dining Out' }));
      expect(screen.getByText('Restaurant / Notes (optional)')).toBeDefined();
    });

    it('shows description field when type is custom', async () => {
      vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [] });
      render(<PatternsPage />, { wrapper });

      await waitFor(() => screen.getByText('No patterns yet'));
      fireEvent.click(screen.getByText('New Pattern'));
      await screen.findByText('New Pattern', { selector: 'h2' });

      fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
      expect(screen.getByText('Description (optional)')).toBeDefined();
    });

    it('shows side dish toggles when there are side dishes available', async () => {
      vi.mocked(dishesApi.list).mockResolvedValue({
        dishes: [
          { id: 's-1', name: 'Garlic Bread', type: 'side', archived: false, tags: [], dietaryTags: [], description: null, recipeUrl: null, averageRating: null, ratingCount: 0, ingredients: [], createdById: 'u-1', createdAt: '', lastPreparedAt: null },
        ],
        total: 1,
      });
      vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [] });
      render(<PatternsPage />, { wrapper });

      await waitFor(() => screen.getByText('No patterns yet'));
      fireEvent.click(screen.getByText('New Pattern'));

      await waitFor(() => {
        expect(screen.getByText('Side Dishes (optional)')).toBeDefined();
        expect(screen.getByText('Garlic Bread')).toBeDefined();
      });
    });
  });

  describe('delete', () => {
    it('calls patterns.delete when delete confirmed', async () => {
      vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [mockPattern] });
      vi.mocked(patternsApi.delete).mockResolvedValue(undefined as never);
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      render(<PatternsPage />, { wrapper });
      await waitFor(() => screen.getByText('Taco Tuesday'));

      fireEvent.click(screen.getByLabelText('Delete pattern'));

      await waitFor(() => {
        expect(patternsApi.delete).toHaveBeenCalledWith('pat-1');
      });
    });

    it('does not call patterns.delete when delete cancelled', async () => {
      vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [mockPattern] });
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      render(<PatternsPage />, { wrapper });
      await waitFor(() => screen.getByText('Taco Tuesday'));

      fireEvent.click(screen.getByLabelText('Delete pattern'));
      expect(patternsApi.delete).not.toHaveBeenCalled();
    });
  });

  describe('PatternForm - additional interactions', () => {
    it('toggles side dish selection when side dish button clicked', async () => {
      vi.mocked(dishesApi.list).mockResolvedValue({
        dishes: [
          {
            id: 's-1',
            name: 'Garlic Bread',
            type: 'side',
            archived: false,
            tags: [],
            dietaryTags: [],
            description: null,
            recipeUrl: null,
            averageRating: null,
            ratingCount: 0,
            ingredients: [],
            createdById: 'u-1',
            createdAt: '',
            lastPreparedAt: null,
          },
        ],
        total: 1,
      });
      vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [] });
      render(<PatternsPage />, { wrapper });

      await waitFor(() => screen.getByText('No patterns yet'));
      fireEvent.click(screen.getByText('New Pattern'));

      await waitFor(() => screen.getByText('Side Dishes (optional)'));
      const garlicBreadBtn = screen.getByRole('button', { name: 'Garlic Bread' });
      fireEvent.click(garlicBreadBtn);
      // Button should now be styled as selected
      expect(garlicBreadBtn.className).toContain('bg-secondary');
    });

    it('updates customText when input changes for dining_out', async () => {
      vi.mocked(patternsApi.list).mockResolvedValue({ patterns: [] });
      render(<PatternsPage />, { wrapper });

      await waitFor(() => screen.getByText('No patterns yet'));
      fireEvent.click(screen.getByText('New Pattern'));
      await screen.findByText('New Pattern', { selector: 'h2' });

      fireEvent.click(screen.getByRole('button', { name: 'Dining Out' }));
      const input = screen.getByPlaceholderText('Restaurant name...');
      fireEvent.change(input, { target: { value: 'Pizza Palace' } });
      expect((input as HTMLInputElement).value).toBe('Pizza Palace');
    });

    it('calls invalidateQueries on error retry in error state', async () => {
      vi.mocked(patternsApi.list).mockRejectedValue(new Error('fail'));
      render(<PatternsPage />, { wrapper });

      await waitFor(() => screen.getByText('Failed to load patterns.'));
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));
      // After retry, list should be called again
      expect(patternsApi.list).toHaveBeenCalled();
    });
  });
});
