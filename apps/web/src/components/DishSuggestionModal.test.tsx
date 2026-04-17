import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DishSuggestionModal } from './DishSuggestionModal';
import type { SuggestedRestaurantDish } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  restaurants: {
    dishSuggestions: vi.fn(),
  },
}));

import { restaurants } from '@/lib/api';

const mockDish: SuggestedRestaurantDish = {
  id: 'dish-1',
  restaurantId: 'rest-1',
  name: 'Pad Thai',
  notes: 'Spicy and delicious',
  averageRating: 4.5,
  ratingCount: 3,
  userRatings: [
    { userId: 'u-1', displayName: 'Alice', stars: 5, note: null },
    { userId: 'u-2', displayName: 'Bob', stars: 4, note: 'Good portion' },
  ],
  reasons: ['Rated 4.5 ★ (3 ratings)', 'Ordered 3 times'],
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.mocked(restaurants.dishSuggestions).mockResolvedValue({ suggestions: [mockDish] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DishSuggestionModal', () => {
  it('renders nothing when open is false', () => {
    render(<DishSuggestionModal open={false} restaurantId="rest-1" onClose={vi.fn()} />, {
      wrapper,
    });
    expect(screen.queryByText('What should I order?')).toBeNull();
  });

  it('shows loading skeletons while fetching', () => {
    vi.mocked(restaurants.dishSuggestions).mockReturnValue(new Promise(() => {}));
    render(<DishSuggestionModal open={true} restaurantId="rest-1" onClose={vi.fn()} />, {
      wrapper,
    });
    const pulseElements = document.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('shows empty state when no dishes', async () => {
    vi.mocked(restaurants.dishSuggestions).mockResolvedValue({ suggestions: [] });
    render(<DishSuggestionModal open={true} restaurantId="rest-1" onClose={vi.fn()} />, {
      wrapper,
    });
    await waitFor(() => {
      expect(screen.getByText('No dishes tracked yet — add some dishes first!')).toBeDefined();
    });
  });

  it('renders dish cards with names and ratings', async () => {
    render(<DishSuggestionModal open={true} restaurantId="rest-1" onClose={vi.fn()} />, {
      wrapper,
    });
    await waitFor(() => {
      expect(screen.getByText('Pad Thai')).toBeDefined();
      expect(screen.getByText('4.5')).toBeDefined();
    });
  });

  it('shows per-user ratings', async () => {
    render(<DishSuggestionModal open={true} restaurantId="rest-1" onClose={vi.fn()} />, {
      wrapper,
    });
    await waitFor(() => {
      expect(screen.getByText('Alice: 5★, Bob: 4★')).toBeDefined();
    });
  });

  it('shows reasons text', async () => {
    render(<DishSuggestionModal open={true} restaurantId="rest-1" onClose={vi.fn()} />, {
      wrapper,
    });
    await waitFor(() => {
      expect(screen.getByText('Rated 4.5 ★ (3 ratings)')).toBeDefined();
      expect(screen.getByText('Ordered 3 times')).toBeDefined();
    });
  });

  it('calls onClose when Esc is pressed', () => {
    const onClose = vi.fn();
    render(<DishSuggestionModal open={true} restaurantId="rest-1" onClose={onClose} />, {
      wrapper,
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<DishSuggestionModal open={true} restaurantId="rest-1" onClose={onClose} />, {
      wrapper,
    });
    // The backdrop is the fixed inset-0 bg-black/50 div (first child of the portal)
    const backdrop = document.querySelector('.bg-black\\/50') as HTMLElement;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when X button is clicked', () => {
    const onClose = vi.fn();
    render(<DishSuggestionModal open={true} restaurantId="rest-1" onClose={onClose} />, {
      wrapper,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows dish notes when present', async () => {
    render(<DishSuggestionModal open={true} restaurantId="rest-1" onClose={vi.fn()} />, {
      wrapper,
    });
    await waitFor(() => {
      expect(screen.getByText('Spicy and delicious')).toBeDefined();
    });
  });
});
