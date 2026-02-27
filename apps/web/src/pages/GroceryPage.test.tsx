import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { GroceryPage } from './GroceryPage';

vi.mock('@/lib/api', () => ({
  menus: {
    getGroceries: vi.fn(),
    addCustomItem: vi.fn(),
    deleteCustomItem: vi.fn(),
    updateCustomItem: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { menus } from '@/lib/api';

const baseGroceriesResponse = {
  groceries: [],
  customItems: [],
  weekStartDate: '2024-06-10',
};

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
    vi.mocked(menus.getGroceries).mockResolvedValue(baseGroceriesResponse);
    render(<GroceryPage />, { wrapper });
    expect(screen.getByText('Grocery List')).toBeTruthy();
  });

  it('shows empty state when no groceries', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue(baseGroceriesResponse);
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
      customItems: [],
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
      customItems: [],
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
      customItems: [],
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
      customItems: [],
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
      customItems: [],
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
      customItems: [],
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
        {
          name: 'Olive Oil',
          quantity: null,
          unit: null,
          dishes: ['Pasta'],
          notes: [],
          inPantry: true,
        },
      ],
      customItems: [],
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
      customItems: [],
      weekStartDate: '2024-06-10',
    });
    render(<GroceryPage />, { wrapper });
    expect(await screen.findByText('Pepper')).toBeTruthy();
  });

  it('renders item dish and note details', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [
        {
          name: 'Basil',
          quantity: null,
          unit: null,
          dishes: ['Pizza'],
          notes: ['fresh'],
          inPantry: false,
        },
      ],
      customItems: [],
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
      customItems: [],
      weekStartDate: '2024-06-10',
    });
    render(<GroceryPage />, { wrapper });
    fireEvent.click(await screen.findByText('Copy'));
    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith(expect.stringContaining('Flour'));
    });
  });

  // Custom items tests
  describe('custom items', () => {
    it('renders custom items in the list', async () => {
      vi.mocked(menus.getGroceries).mockResolvedValue({
        groceries: [],
        customItems: [
          {
            id: 'ci-1',
            weekDate: '2024-06-10',
            name: 'Paper towels',
            quantity: null,
            unit: null,
            sortOrder: 0,
          },
        ],
        weekStartDate: '2024-06-10',
      });
      render(<GroceryPage />, { wrapper });
      expect(await screen.findByText('Paper towels')).toBeTruthy();
    });

    it('renders custom item with quantity and unit', async () => {
      vi.mocked(menus.getGroceries).mockResolvedValue({
        groceries: [],
        customItems: [
          {
            id: 'ci-2',
            weekDate: '2024-06-10',
            name: 'Milk',
            quantity: 2,
            unit: 'L',
            sortOrder: 0,
          },
        ],
        weekStartDate: '2024-06-10',
      });
      render(<GroceryPage />, { wrapper });
      expect(await screen.findByText('Milk')).toBeTruthy();
      expect(await screen.findByText(/2.*L/)).toBeTruthy();
    });

    it('shows Custom Items section header', async () => {
      vi.mocked(menus.getGroceries).mockResolvedValue(baseGroceriesResponse);
      render(<GroceryPage />, { wrapper });
      expect(await screen.findByText('Custom Items')).toBeTruthy();
    });

    it('shows the add item form', async () => {
      vi.mocked(menus.getGroceries).mockResolvedValue(baseGroceriesResponse);
      render(<GroceryPage />, { wrapper });
      expect(await screen.findByPlaceholderText('Item name')).toBeTruthy();
      expect(await screen.findByRole('button', { name: /Add item/i })).toBeTruthy();
    });

    it('add item form submits and calls addCustomItem', async () => {
      vi.mocked(menus.getGroceries).mockResolvedValue(baseGroceriesResponse);
      vi.mocked(menus.addCustomItem).mockResolvedValue({
        id: 'ci-new',
        weekDate: '2024-06-10',
        name: 'Bananas',
        quantity: null,
        unit: null,
        sortOrder: 0,
      });

      render(<GroceryPage />, { wrapper });
      const nameInput = await screen.findByPlaceholderText('Item name');
      fireEvent.change(nameInput, { target: { value: 'Bananas' } });
      fireEvent.click(screen.getByRole('button', { name: /Add item/i }));

      await waitFor(() => {
        expect(vi.mocked(menus.addCustomItem)).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ name: 'Bananas' })
        );
      });
    });

    it('add item form clears after successful submit', async () => {
      vi.mocked(menus.getGroceries).mockResolvedValue(baseGroceriesResponse);
      vi.mocked(menus.addCustomItem).mockResolvedValue({
        id: 'ci-new',
        weekDate: '2024-06-10',
        name: 'Bananas',
        quantity: null,
        unit: null,
        sortOrder: 0,
      });

      render(<GroceryPage />, { wrapper });
      const nameInput = await screen.findByPlaceholderText('Item name');
      fireEvent.change(nameInput, { target: { value: 'Bananas' } });
      fireEvent.click(screen.getByRole('button', { name: /Add item/i }));

      await waitFor(() => {
        expect((screen.getByPlaceholderText('Item name') as HTMLInputElement).value).toBe('');
      });
    });

    it('does not submit when item name is empty', async () => {
      vi.mocked(menus.getGroceries).mockResolvedValue(baseGroceriesResponse);
      render(<GroceryPage />, { wrapper });
      await screen.findByPlaceholderText('Item name');
      // Add button should be disabled when name is empty
      const addBtn = screen.getByRole('button', { name: /Add item/i });
      expect((addBtn as HTMLButtonElement).disabled).toBe(true);
      expect(vi.mocked(menus.addCustomItem)).not.toHaveBeenCalled();
    });

    it('delete button calls deleteCustomItem', async () => {
      vi.mocked(menus.getGroceries).mockResolvedValue({
        groceries: [],
        customItems: [
          {
            id: 'ci-1',
            weekDate: '2024-06-10',
            name: 'Paper towels',
            quantity: null,
            unit: null,
            sortOrder: 0,
          },
        ],
        weekStartDate: '2024-06-10',
      });
      vi.mocked(menus.deleteCustomItem).mockResolvedValue(undefined);

      render(<GroceryPage />, { wrapper });
      const deleteBtn = await screen.findByRole('button', { name: /Delete Paper towels/i });
      fireEvent.click(deleteBtn);

      await waitFor(() => {
        expect(vi.mocked(menus.deleteCustomItem)).toHaveBeenCalledWith('ci-1');
      });
    });

    it('submits on Enter key in name input', async () => {
      vi.mocked(menus.getGroceries).mockResolvedValue(baseGroceriesResponse);
      vi.mocked(menus.addCustomItem).mockResolvedValue({
        id: 'ci-new',
        weekDate: '2024-06-10',
        name: 'Eggs',
        quantity: null,
        unit: null,
        sortOrder: 0,
      });

      render(<GroceryPage />, { wrapper });
      const nameInput = await screen.findByPlaceholderText('Item name');
      fireEvent.change(nameInput, { target: { value: 'Eggs' } });
      fireEvent.keyDown(nameInput, { key: 'Enter' });

      await waitFor(() => {
        expect(vi.mocked(menus.addCustomItem)).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ name: 'Eggs' })
        );
      });
    });
  });
});
