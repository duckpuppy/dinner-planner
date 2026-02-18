import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuggestionModal } from './SuggestionModal';
import type { SuggestedDish } from '@/lib/api';

// Mock the api module
vi.mock('@/lib/api', () => ({
  suggestions: {
    list: vi.fn(),
  },
}));

import { suggestions as suggestionsApi } from '@/lib/api';

const mockDish: SuggestedDish = {
  id: 'dish-1',
  name: 'Spaghetti Bolognese',
  type: 'main',
  description: 'Classic pasta',
  tags: ['italian', 'pasta'],
  avgRating: 4.5,
  totalRatings: 3,
  score: 4.2,
  lastPreparedDate: '2024-05-01',
  reasons: ['Rated 4.5 ★ (3 ratings)', 'Last made 6 weeks ago'],
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.mocked(suggestionsApi.list).mockResolvedValue({ suggestions: [mockDish] });
});

afterEach(() => {
  cleanup();
});

describe('SuggestionModal', () => {
  it('renders nothing when closed', () => {
    render(
      <SuggestionModal open={false} availableTags={[]} onSelect={vi.fn()} onClose={vi.fn()} />,
      { wrapper }
    );
    expect(screen.queryByText('Meal Suggestion')).toBeNull();
  });

  it('renders the modal when open', async () => {
    render(
      <SuggestionModal open={true} availableTags={[]} onSelect={vi.fn()} onClose={vi.fn()} />,
      { wrapper }
    );
    expect(screen.getByText('Meal Suggestion')).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText('Spaghetti Bolognese')).toBeDefined();
    });
  });

  it('shows dish reasons', async () => {
    render(
      <SuggestionModal open={true} availableTags={[]} onSelect={vi.fn()} onClose={vi.fn()} />,
      { wrapper }
    );
    await waitFor(() => {
      expect(screen.getByText('Rated 4.5 ★ (3 ratings)')).toBeDefined();
      expect(screen.getByText('Last made 6 weeks ago')).toBeDefined();
    });
  });

  it('calls onSelect when "Use this" is clicked', async () => {
    const onSelect = vi.fn();
    render(
      <SuggestionModal open={true} availableTags={[]} onSelect={onSelect} onClose={vi.fn()} />,
      { wrapper }
    );
    await waitFor(() => screen.getAllByText('Use this'));
    fireEvent.click(screen.getAllByText('Use this')[0]);
    expect(onSelect).toHaveBeenCalledWith(mockDish);
  });

  it('calls onClose when X is clicked', () => {
    const onClose = vi.fn();
    render(
      <SuggestionModal open={true} availableTags={[]} onSelect={vi.fn()} onClose={onClose} />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(
      <SuggestionModal open={true} availableTags={[]} onSelect={vi.fn()} onClose={onClose} />,
      { wrapper }
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('excludes dish when "Not this" clicked and refetches', async () => {
    render(
      <SuggestionModal open={true} availableTags={[]} onSelect={vi.fn()} onClose={vi.fn()} />,
      { wrapper }
    );
    await waitFor(() => screen.getAllByText('Not this'));
    fireEvent.click(screen.getAllByText('Not this')[0]);
    await waitFor(() => {
      expect(suggestionsApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ exclude: ['dish-1'] })
      );
    });
  });

  it('renders tag filter buttons when tags provided', async () => {
    render(
      <SuggestionModal
        open={true}
        availableTags={['italian', 'quick']}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
      { wrapper }
    );
    expect(screen.getByRole('button', { name: 'italian' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'quick' })).toBeDefined();
  });

  it('passes selected tag to API', async () => {
    render(
      <SuggestionModal
        open={true}
        availableTags={['italian']}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: 'italian' }));
    await waitFor(() => {
      expect(suggestionsApi.list).toHaveBeenCalledWith(expect.objectContaining({ tag: 'italian' }));
    });
  });
});
