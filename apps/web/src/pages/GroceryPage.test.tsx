import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GroceryPage } from './GroceryPage';

vi.mock('@/lib/api', () => ({
  menus: {
    getGroceries: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { menus } from '@/lib/api';

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('GroceryPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders page heading', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [],
      weekStartDate: '2024-06-10',
    });
    render(<GroceryPage />, { wrapper });
    expect(screen.getByText('Grocery List')).toBeTruthy();
  });

  it('shows empty state when no groceries', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [],
      weekStartDate: '2024-06-10',
    });
    const { findByText } = render(<GroceryPage />, { wrapper });
    expect(await findByText('No ingredients this week')).toBeTruthy();
  });

  it('renders grocery items after loading', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [
        { name: 'Flour', quantity: 500, unit: 'g', dishes: ['Pasta'], notes: [] },
        {
          name: 'Salt',
          quantity: null,
          unit: null,
          dishes: ['Pasta', 'Pizza'],
          notes: ['to taste'],
        },
      ],
      weekStartDate: '2024-06-10',
    });
    const { findByText } = render(<GroceryPage />, { wrapper });
    expect(await findByText('Flour')).toBeTruthy();
    expect(await findByText('Salt')).toBeTruthy();
  });
});
