import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RestaurantPicker } from './RestaurantPicker';

vi.mock('@/lib/api', () => ({
  restaurants: {
    list: vi.fn().mockResolvedValue({ restaurants: [], total: 0 }),
    create: vi.fn(),
  },
}));

import { restaurants } from '@/lib/api';

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const noop = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RestaurantPicker', () => {
  describe('trigger button', () => {
    it('renders trigger with placeholder when no value', () => {
      render(<RestaurantPicker value="" onChange={noop} />, { wrapper });
      expect(screen.getByText('Select a restaurant...')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Select restaurant' })).toBeTruthy();
    });

    it('renders trigger with custom placeholder', () => {
      render(<RestaurantPicker value="" onChange={noop} placeholder="Pick a place..." />, {
        wrapper,
      });
      expect(screen.getByText('Pick a place...')).toBeTruthy();
    });

    it('renders trigger with restaurant name when value matches a loaded restaurant', async () => {
      vi.mocked(restaurants.list).mockResolvedValue({
        restaurants: [
          {
            id: 'r1',
            name: 'Thai Garden',
            cuisineType: 'Thai',
            location: null,
            visitCount: 0,
            averageRating: null,
            lastVisitedAt: null,
          },
        ],
        total: 1,
      } as never);
      render(<RestaurantPicker value="r1" onChange={noop} />, { wrapper });
      expect(await screen.findByText('Thai Garden')).toBeTruthy();
    });
  });

  describe('modal open/close', () => {
    it('opens modal with search input when trigger clicked', async () => {
      render(<RestaurantPicker value="" onChange={noop} />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: 'Select restaurant' }));
      expect(await screen.findByLabelText('Search restaurants')).toBeTruthy();
      expect(screen.getByText('Select Restaurant')).toBeTruthy();
    });

    it('closes modal when close button clicked', async () => {
      render(<RestaurantPicker value="" onChange={noop} />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: 'Select restaurant' }));
      await screen.findByLabelText('Search restaurants');
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() => {
        expect(screen.queryByLabelText('Search restaurants')).toBeNull();
      });
    });
  });

  describe('restaurant list', () => {
    it('shows empty state when no restaurants', async () => {
      vi.mocked(restaurants.list).mockResolvedValue({ restaurants: [], total: 0 });
      render(<RestaurantPicker value="" onChange={noop} />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: 'Select restaurant' }));
      expect(await screen.findByText('No restaurants yet')).toBeTruthy();
    });

    it('shows restaurants in the list', async () => {
      vi.mocked(restaurants.list).mockResolvedValue({
        restaurants: [
          {
            id: 'r1',
            name: 'Pizza Palace',
            cuisineType: 'Italian',
            location: null,
            visitCount: 0,
            averageRating: null,
            lastVisitedAt: null,
          },
          {
            id: 'r2',
            name: 'Sushi World',
            cuisineType: 'Japanese',
            location: null,
            visitCount: 0,
            averageRating: null,
            lastVisitedAt: null,
          },
        ],
        total: 2,
      } as never);
      render(<RestaurantPicker value="" onChange={noop} />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: 'Select restaurant' }));
      expect(await screen.findByText('Pizza Palace')).toBeTruthy();
      expect(screen.getByText('Sushi World')).toBeTruthy();
    });

    it('filters restaurants by search query', async () => {
      vi.mocked(restaurants.list).mockResolvedValue({
        restaurants: [
          {
            id: 'r1',
            name: 'Pizza Palace',
            cuisineType: null,
            location: null,
            visitCount: 0,
            averageRating: null,
            lastVisitedAt: null,
          },
          {
            id: 'r2',
            name: 'Sushi World',
            cuisineType: null,
            location: null,
            visitCount: 0,
            averageRating: null,
            lastVisitedAt: null,
          },
        ],
        total: 2,
      } as never);
      render(<RestaurantPicker value="" onChange={noop} />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: 'Select restaurant' }));
      await screen.findByText('Pizza Palace');
      const searchInput = screen.getByLabelText('Search restaurants');
      fireEvent.change(searchInput, { target: { value: 'sushi' } });
      expect(screen.queryByText('Pizza Palace')).toBeNull();
      expect(screen.getByText('Sushi World')).toBeTruthy();
    });

    it('shows no results message when search has no matches', async () => {
      vi.mocked(restaurants.list).mockResolvedValue({
        restaurants: [
          {
            id: 'r1',
            name: 'Pizza Palace',
            cuisineType: null,
            location: null,
            visitCount: 0,
            averageRating: null,
            lastVisitedAt: null,
          },
        ],
        total: 1,
      } as never);
      render(<RestaurantPicker value="" onChange={noop} />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: 'Select restaurant' }));
      await screen.findByText('Pizza Palace');
      fireEvent.change(screen.getByLabelText('Search restaurants'), {
        target: { value: 'xyz' },
      });
      expect(screen.getByText('No restaurants found')).toBeTruthy();
    });
  });

  describe('selection', () => {
    it('calls onChange and closes modal when a restaurant is selected', async () => {
      const onChange = vi.fn();
      vi.mocked(restaurants.list).mockResolvedValue({
        restaurants: [
          {
            id: 'r1',
            name: 'Pizza Palace',
            cuisineType: null,
            location: null,
            visitCount: 0,
            averageRating: null,
            lastVisitedAt: null,
          },
        ],
        total: 1,
      } as never);
      render(<RestaurantPicker value="" onChange={onChange} />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: 'Select restaurant' }));
      const option = await screen.findByRole('option', { name: /Pizza Palace/ });
      fireEvent.click(option);
      expect(onChange).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ id: 'r1', name: 'Pizza Palace' })
      );
      await waitFor(() => {
        expect(screen.queryByLabelText('Search restaurants')).toBeNull();
      });
    });
  });

  describe('create form', () => {
    it('shows create form when Add new restaurant button clicked', async () => {
      render(<RestaurantPicker value="" onChange={noop} />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: 'Select restaurant' }));
      await screen.findByText('Add new restaurant...');
      fireEvent.click(screen.getByText('Add new restaurant...'));
      expect(screen.getByText('New Restaurant')).toBeTruthy();
      expect(screen.getByLabelText(/Name/)).toBeTruthy();
    });

    it('calls restaurants.create when create form submitted', async () => {
      const onChange = vi.fn();
      vi.mocked(restaurants.create).mockResolvedValue({
        id: 'new-1',
        name: 'Taco Town',
        cuisineType: null,
        location: null,
        notes: null,
        visitCount: 0,
        averageRating: null,
        lastVisitedAt: null,
        archived: false,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      } as never);
      render(<RestaurantPicker value="" onChange={onChange} />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: 'Select restaurant' }));
      await screen.findByText('Add new restaurant...');
      fireEvent.click(screen.getByText('Add new restaurant...'));
      const nameInput = screen.getByLabelText(/Name/);
      fireEvent.change(nameInput, { target: { value: 'Taco Town' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      await waitFor(() => {
        expect(restaurants.create).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Taco Town' })
        );
      });
    });

    it('navigates back to list when Back button clicked in create form', async () => {
      render(<RestaurantPicker value="" onChange={noop} />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: 'Select restaurant' }));
      await screen.findByText('Add new restaurant...');
      fireEvent.click(screen.getByText('Add new restaurant...'));
      expect(screen.getByText('New Restaurant')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(screen.queryByText('New Restaurant')).toBeNull();
      expect(screen.getByText('Add new restaurant...')).toBeTruthy();
    });
  });
});
