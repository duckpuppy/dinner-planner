import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PantryPage } from './PantryPage';

vi.mock('@/lib/api', () => ({
  pantry: {
    list: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/mobile/PullToRefresh', () => ({
  PullToRefresh: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/mobile/SwipeableListItem', () => ({
  SwipeableListItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/hooks/useSwipeActions', () => ({
  useSwipeActions: () => ({ activeItemId: null, openSwipe: vi.fn(), closeSwipe: vi.fn() }),
}));

import { pantry as pantryApi } from '@/lib/api';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const mockItem = {
  id: 'item-1',
  ingredientName: 'Olive oil',
  quantity: 1,
  unit: 'bottle',
  expiresAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PantryPage', () => {
  it('renders page heading', () => {
    vi.mocked(pantryApi.list).mockResolvedValue({ items: [] });
    render(<PantryPage />, { wrapper });
    expect(screen.getByText('Pantry')).toBeTruthy();
  });

  it('shows empty state when pantry is empty', async () => {
    vi.mocked(pantryApi.list).mockResolvedValue({ items: [] });
    const { findByText } = render(<PantryPage />, { wrapper });
    expect(await findByText('Your pantry is empty')).toBeTruthy();
  });

  it('renders items after loading', async () => {
    vi.mocked(pantryApi.list).mockResolvedValue({ items: [mockItem] });
    const { findByText } = render(<PantryPage />, { wrapper });
    expect(await findByText('Olive oil')).toBeTruthy();
  });

  it('shows item count', async () => {
    vi.mocked(pantryApi.list).mockResolvedValue({ items: [mockItem] });
    const { findByText } = render(<PantryPage />, { wrapper });
    expect(await findByText('1 item in pantry')).toBeTruthy();
  });

  it('shows expiry badge for items with expiry date', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    vi.mocked(pantryApi.list).mockResolvedValue({
      items: [{ ...mockItem, expiresAt: futureDate }],
    });
    const { findByText } = render(<PantryPage />, { wrapper });
    expect(await findByText(/Expires/)).toBeTruthy();
  });

  it('shows Add Item button', () => {
    vi.mocked(pantryApi.list).mockResolvedValue({ items: [] });
    render(<PantryPage />, { wrapper });
    expect(screen.getByText('Add Item')).toBeTruthy();
  });
});
