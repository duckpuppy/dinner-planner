import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RestaurantSuggestionModal } from './RestaurantSuggestionModal';
import type { SuggestedRestaurant } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  restaurants: {
    suggestions: vi.fn(),
  },
}));

import { restaurants } from '@/lib/api';

const mockRestaurant: SuggestedRestaurant = {
  id: 'rest-1',
  name: 'Thai Garden',
  cuisineType: 'Thai',
  location: 'Downtown',
  averageRating: 4.2,
  totalRatings: 5,
  visitCount: 3,
  lastVisitedDate: '2024-03-15',
  score: 3.8,
  reasons: ['Visited 3 times', 'Rated 4.2 ★ (5 ratings)'],
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.mocked(restaurants.suggestions).mockResolvedValue({ suggestions: [mockRestaurant] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RestaurantSuggestionModal', () => {
  it('renders nothing when closed', () => {
    render(<RestaurantSuggestionModal open={false} onSelect={vi.fn()} onClose={vi.fn()} />, {
      wrapper,
    });
    expect(screen.queryByText('Restaurant Suggestion')).toBeNull();
  });

  it('renders the modal when open', async () => {
    render(<RestaurantSuggestionModal open={true} onSelect={vi.fn()} onClose={vi.fn()} />, {
      wrapper,
    });
    expect(screen.getByText('Restaurant Suggestion')).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText('Thai Garden')).toBeDefined();
    });
  });

  it('shows restaurant reasons', async () => {
    render(<RestaurantSuggestionModal open={true} onSelect={vi.fn()} onClose={vi.fn()} />, {
      wrapper,
    });
    await waitFor(() => {
      expect(screen.getByText('Visited 3 times')).toBeDefined();
      expect(screen.getByText('Rated 4.2 ★ (5 ratings)')).toBeDefined();
    });
  });

  it('shows restaurant rating', async () => {
    render(<RestaurantSuggestionModal open={true} onSelect={vi.fn()} onClose={vi.fn()} />, {
      wrapper,
    });
    await waitFor(() => {
      expect(screen.getByText('4.2')).toBeDefined();
    });
  });

  it('shows cuisine type and location', async () => {
    render(<RestaurantSuggestionModal open={true} onSelect={vi.fn()} onClose={vi.fn()} />, {
      wrapper,
    });
    await waitFor(() => {
      expect(screen.getByText('Thai · Downtown')).toBeDefined();
    });
  });

  it('calls onSelect with id and name when Select is clicked', async () => {
    const onSelect = vi.fn();
    render(<RestaurantSuggestionModal open={true} onSelect={onSelect} onClose={vi.fn()} />, {
      wrapper,
    });
    await waitFor(() => screen.getAllByText('Select'));
    fireEvent.click(screen.getAllByText('Select')[0]);
    expect(onSelect).toHaveBeenCalledWith({ id: 'rest-1', name: 'Thai Garden' });
  });

  it('calls onClose when X button is clicked', () => {
    const onClose = vi.fn();
    render(<RestaurantSuggestionModal open={true} onSelect={vi.fn()} onClose={onClose} />, {
      wrapper,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<RestaurantSuggestionModal open={true} onSelect={vi.fn()} onClose={onClose} />, {
      wrapper,
    });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows loading skeletons while fetching', () => {
    vi.mocked(restaurants.suggestions).mockReturnValue(new Promise(() => {}));
    render(<RestaurantSuggestionModal open={true} onSelect={vi.fn()} onClose={vi.fn()} />, {
      wrapper,
    });
    // Skeletons rendered during loading — look for animate-pulse elements
    const pulseElements = document.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('shows empty state when no suggestions', async () => {
    vi.mocked(restaurants.suggestions).mockResolvedValue({ suggestions: [] });
    render(<RestaurantSuggestionModal open={true} onSelect={vi.fn()} onClose={vi.fn()} />, {
      wrapper,
    });
    await waitFor(() => {
      expect(screen.getByText('No suggestions available')).toBeDefined();
    });
  });

  it('passes exclude param to API', async () => {
    render(
      <RestaurantSuggestionModal
        open={true}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        exclude={['rest-99']}
      />,
      { wrapper }
    );
    await waitFor(() => {
      expect(restaurants.suggestions).toHaveBeenCalledWith(
        expect.objectContaining({ exclude: ['rest-99'] })
      );
    });
  });
});
