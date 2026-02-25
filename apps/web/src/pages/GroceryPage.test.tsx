import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
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
  return (
    <MemoryRouter initialEntries={['/grocery']}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
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
        { name: 'Flour', quantity: 500, unit: 'g', dishes: ['Pasta'], notes: [], inPantry: false },
        {
          name: 'Salt',
          quantity: null,
          unit: null,
          dishes: ['Pasta', 'Pizza'],
          notes: ['to taste'],
          inPantry: false,
        },
      ],
      weekStartDate: '2024-06-10',
    });
    const { findByText } = render(<GroceryPage />, { wrapper });
    expect(await findByText('Flour')).toBeTruthy();
    expect(await findByText('Salt')).toBeTruthy();
  });

  it('shows error state when fetch fails', async () => {
    vi.mocked(menus.getGroceries).mockRejectedValue(new Error('Network error'));
    const { findByText } = render(<GroceryPage />, { wrapper });
    expect(await findByText('Failed to load grocery list.')).toBeTruthy();
  });

  it('shows Try again button on error', async () => {
    vi.mocked(menus.getGroceries).mockRejectedValue(new Error('Network error'));
    const { findByText } = render(<GroceryPage />, { wrapper });
    expect(await findByText('Try again')).toBeTruthy();
  });

  it('shows item count when items are loaded', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [
        { name: 'Flour', quantity: 500, unit: 'g', dishes: ['Pasta'], notes: [], inPantry: false },
        { name: 'Salt', quantity: null, unit: null, dishes: [], notes: [], inPantry: false },
      ],
      weekStartDate: '2024-06-10',
    });
    const { findByText } = render(<GroceryPage />, { wrapper });
    expect(await findByText('0 of 2 items checked')).toBeTruthy();
  });

  it('shows Copy button when items are loaded', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [
        { name: 'Flour', quantity: 500, unit: 'g', dishes: ['Pasta'], notes: [], inPantry: false },
      ],
      weekStartDate: '2024-06-10',
    });
    render(<GroceryPage />, { wrapper });
    expect(await screen.findByText('Copy')).toBeTruthy();
  });

  it('toggles item checked state when clicked', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [
        { name: 'Flour', quantity: 500, unit: 'g', dishes: ['Pasta'], notes: [], inPantry: false },
      ],
      weekStartDate: '2024-06-10',
    });
    render(<GroceryPage />, { wrapper });
    const flourBtn = await screen.findByRole('button', { name: /Check Flour/i });
    fireEvent.click(flourBtn);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Uncheck Flour/i })).toBeTruthy();
    });
  });

  it('shows Clear button when items are checked', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [
        { name: 'Flour', quantity: 500, unit: 'g', dishes: ['Pasta'], notes: [], inPantry: false },
      ],
      weekStartDate: '2024-06-10',
    });
    render(<GroceryPage />, { wrapper });
    const flourBtn = await screen.findByRole('button', { name: /Check Flour/i });
    fireEvent.click(flourBtn);
    expect(await screen.findByText('Clear')).toBeTruthy();
  });

  it('clears all checked items when Clear clicked', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [
        { name: 'Flour', quantity: 500, unit: 'g', dishes: ['Pasta'], notes: [], inPantry: false },
      ],
      weekStartDate: '2024-06-10',
    });
    render(<GroceryPage />, { wrapper });
    const flourBtn = await screen.findByRole('button', { name: /Check Flour/i });
    fireEvent.click(flourBtn);
    await screen.findByText('Clear');
    fireEvent.click(screen.getByText('Clear'));
    await waitFor(() => {
      expect(screen.queryByText('Clear')).toBeNull();
    });
  });

  it('renders pantry items in In Pantry section', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [
        { name: 'Olive Oil', quantity: null, unit: null, dishes: ['Pasta'], notes: [], inPantry: true },
      ],
      weekStartDate: '2024-06-10',
    });
    render(<GroceryPage />, { wrapper });
    // "In Pantry" appears as both section header and item badge
    const pantryLabels = await screen.findAllByText('In Pantry');
    expect(pantryLabels.length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText('Olive Oil')).toBeTruthy();
  });

  it('renders item with unit only (no quantity)', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [
        { name: 'Pepper', quantity: null, unit: 'tsp', dishes: [], notes: [], inPantry: false },
      ],
      weekStartDate: '2024-06-10',
    });
    render(<GroceryPage />, { wrapper });
    expect(await screen.findByText('Pepper')).toBeTruthy();
  });

  it('renders item dish and note details', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [
        { name: 'Basil', quantity: null, unit: null, dishes: ['Pizza'], notes: ['fresh'], inPantry: false },
      ],
      weekStartDate: '2024-06-10',
    });
    render(<GroceryPage />, { wrapper });
    expect(await screen.findByText(/fresh/)).toBeTruthy();
    expect(await screen.findByText(/Pizza/)).toBeTruthy();
  });

  it('copies list to clipboard when Copy clicked', async () => {
    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: mockWriteText },
      writable: true,
      configurable: true,
    });
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [
        { name: 'Flour', quantity: 500, unit: 'g', dishes: ['Pasta'], notes: [], inPantry: false },
      ],
      weekStartDate: '2024-06-10',
    });
    render(<GroceryPage />, { wrapper });
    fireEvent.click(await screen.findByText('Copy'));
    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith(expect.stringContaining('Flour'));
    });
  });
});
