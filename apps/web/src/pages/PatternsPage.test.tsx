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
});
