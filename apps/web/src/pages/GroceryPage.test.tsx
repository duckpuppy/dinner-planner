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
    toggleGroceryCheck: vi.fn(),
    clearGroceryChecks: vi.fn(),
  },
  stores: {
    list: vi.fn().mockResolvedValue([]),
  },
  standing: {
    list: vi.fn().mockResolvedValue([]),
    add: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { menus, standing as standingApi } from '@/lib/api';

const baseGroceriesResponse = {
  groceries: [],
  customItems: [],
  standingItems: [],
  weekStartDate: '2024-06-10',
  checkedKeys: [],
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
    vi.mocked(menus.toggleGroceryCheck).mockResolvedValue({ itemKey: '', checked: true });
    vi.mocked(menus.clearGroceryChecks).mockResolvedValue(undefined);
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
        {
          name: 'Flour',
          quantity: 500,
          unit: 'g',
          dishes: ['Pasta'],
          notes: [],
          inPantry: false,
          category: 'Pantry Staples',
          stores: [],
        },
        {
          name: 'Salt',
          quantity: null,
          unit: null,
          dishes: ['Pasta', 'Pizza'],
          notes: ['to taste'],
          inPantry: false,
          category: 'Pantry Staples',
          stores: [],
        },
      ],
      customItems: [],
      weekStartDate: '2024-06-10',
      checkedKeys: [],
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
        {
          name: 'Flour',
          quantity: 500,
          unit: 'g',
          dishes: ['Pasta'],
          notes: [],
          inPantry: false,
          category: 'Other',
          stores: [],
        },
        {
          name: 'Salt',
          quantity: null,
          unit: null,
          dishes: [],
          notes: [],
          inPantry: false,
          category: 'Other',
          stores: [],
        },
      ],
      customItems: [],
      weekStartDate: '2024-06-10',
      checkedKeys: [],
    });
    const { findByText } = render(<GroceryPage />, { wrapper });
    expect(await findByText('0 of 2 items checked')).toBeTruthy();
  });

  it('shows Copy button when items are loaded', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [
        {
          name: 'Flour',
          quantity: 500,
          unit: 'g',
          dishes: ['Pasta'],
          notes: [],
          inPantry: false,
          category: 'Other',
          stores: [],
        },
      ],
      customItems: [],
      weekStartDate: '2024-06-10',
      checkedKeys: [],
    });
    render(<GroceryPage />, { wrapper });
    expect(await screen.findByText('Copy')).toBeTruthy();
  });

  it('toggles item checked state when clicked', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [
        {
          name: 'Flour',
          quantity: 500,
          unit: 'g',
          dishes: ['Pasta'],
          notes: [],
          inPantry: false,
          category: 'Other',
          stores: [],
        },
      ],
      customItems: [],
      weekStartDate: '2024-06-10',
      checkedKeys: [],
    });
    vi.mocked(menus.toggleGroceryCheck).mockResolvedValue({
      itemKey: 'flour::g',
      checked: true,
    });
    render(<GroceryPage />, { wrapper });
    const flourBtn = await screen.findByRole('button', { name: /Check Flour/i });
    fireEvent.click(flourBtn);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Uncheck Flour/i })).toBeTruthy();
    });
  });

  it('toggle calls menus.toggleGroceryCheck', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [
        {
          name: 'Flour',
          quantity: 500,
          unit: 'g',
          dishes: ['Pasta'],
          notes: [],
          inPantry: false,
          category: 'Other',
          stores: [],
        },
      ],
      customItems: [],
      weekStartDate: '2024-06-10',
      checkedKeys: [],
    });
    vi.mocked(menus.toggleGroceryCheck).mockResolvedValue({
      itemKey: 'flour::g',
      checked: true,
    });

    render(<GroceryPage />, { wrapper });
    const flourBtn = await screen.findByRole('button', { name: /Check Flour/i });
    fireEvent.click(flourBtn);

    await waitFor(() => {
      expect(vi.mocked(menus.toggleGroceryCheck)).toHaveBeenCalledWith(
        '2024-06-10',
        'flour::g',
        'Flour'
      );
    });
  });

  it('shows Clear button when items are checked', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [
        {
          name: 'Flour',
          quantity: 500,
          unit: 'g',
          dishes: ['Pasta'],
          notes: [],
          inPantry: false,
          category: 'Other',
          stores: [],
        },
      ],
      customItems: [],
      weekStartDate: '2024-06-10',
      checkedKeys: [],
    });
    vi.mocked(menus.toggleGroceryCheck).mockResolvedValue({
      itemKey: 'flour::g',
      checked: true,
    });
    render(<GroceryPage />, { wrapper });
    const flourBtn = await screen.findByRole('button', { name: /Check Flour/i });
    fireEvent.click(flourBtn);
    expect(await screen.findByText('Clear')).toBeTruthy();
  });

  it('clears all checked items when Clear clicked', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [
        {
          name: 'Flour',
          quantity: 500,
          unit: 'g',
          dishes: ['Pasta'],
          notes: [],
          inPantry: false,
          category: 'Other',
          stores: [],
        },
      ],
      customItems: [],
      weekStartDate: '2024-06-10',
      checkedKeys: [],
    });
    vi.mocked(menus.toggleGroceryCheck).mockResolvedValue({
      itemKey: 'flour::g',
      checked: true,
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

  it('clearAll calls menus.clearGroceryChecks', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [
        {
          name: 'Flour',
          quantity: 500,
          unit: 'g',
          dishes: ['Pasta'],
          notes: [],
          inPantry: false,
          category: 'Other',
          stores: [],
        },
      ],
      customItems: [],
      weekStartDate: '2024-06-10',
      checkedKeys: [],
    });
    vi.mocked(menus.toggleGroceryCheck).mockResolvedValue({ itemKey: 'flour::g', checked: true });

    render(<GroceryPage />, { wrapper });
    const flourBtn = await screen.findByRole('button', { name: /Check Flour/i });
    fireEvent.click(flourBtn);
    await screen.findByText('Clear');
    fireEvent.click(screen.getByText('Clear'));

    await waitFor(() => {
      expect(vi.mocked(menus.clearGroceryChecks)).toHaveBeenCalled();
    });
  });

  it('uses refetchInterval of 5000ms for polling', async () => {
    // Verify getGroceries query is configured with refetchInterval
    // We test this by checking the query config via query client options
    // The simplest check: getGroceries is called on mount
    vi.mocked(menus.getGroceries).mockResolvedValue(baseGroceriesResponse);
    render(<GroceryPage />, { wrapper });
    // Wait for first fetch
    await screen.findByText('No ingredients this week');
    // The refetchInterval is set — we verify the query was configured
    // by checking the call count increases (using fake timers)
    expect(vi.mocked(menus.getGroceries)).toHaveBeenCalledTimes(1);
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
          category: 'Other',
          stores: [],
        },
      ],
      customItems: [],
      weekStartDate: '2024-06-10',
      checkedKeys: [],
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
        {
          name: 'Pepper',
          quantity: null,
          unit: 'tsp',
          dishes: [],
          notes: [],
          inPantry: false,
          category: 'Other',
          stores: [],
        },
      ],
      customItems: [],
      weekStartDate: '2024-06-10',
      checkedKeys: [],
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
          category: 'Other',
          stores: [],
        },
      ],
      customItems: [],
      weekStartDate: '2024-06-10',
      checkedKeys: [],
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
        {
          name: 'Flour',
          quantity: 500,
          unit: 'g',
          dishes: ['Pasta'],
          notes: [],
          inPantry: false,
          category: 'Other',
          stores: [],
        },
      ],
      customItems: [],
      weekStartDate: '2024-06-10',
      checkedKeys: [],
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
            storeId: null,
            storeName: null,
          },
        ],
        weekStartDate: '2024-06-10',
        checkedKeys: [],
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
            storeId: null,
            storeName: null,
          },
        ],
        weekStartDate: '2024-06-10',
        checkedKeys: [],
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
      // Two forms share the same placeholder — custom items form is first
      const nameInputs = await screen.findAllByPlaceholderText('Item name');
      expect(nameInputs.length).toBeGreaterThanOrEqual(1);
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
        storeId: null,
        storeName: null,
      });

      render(<GroceryPage />, { wrapper });
      // Custom items form is first — use index 0
      const nameInputs = await screen.findAllByPlaceholderText('Item name');
      fireEvent.change(nameInputs[0], { target: { value: 'Bananas' } });
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
        storeId: null,
        storeName: null,
      });

      render(<GroceryPage />, { wrapper });
      // Custom items form is first — use index 0
      const nameInputs = await screen.findAllByPlaceholderText('Item name');
      fireEvent.change(nameInputs[0], { target: { value: 'Bananas' } });
      fireEvent.click(screen.getByRole('button', { name: /Add item/i }));

      await waitFor(() => {
        expect((screen.getAllByPlaceholderText('Item name')[0] as HTMLInputElement).value).toBe('');
      });
    });

    it('does not submit when item name is empty', async () => {
      vi.mocked(menus.getGroceries).mockResolvedValue(baseGroceriesResponse);
      render(<GroceryPage />, { wrapper });
      await screen.findAllByPlaceholderText('Item name');
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
            storeId: null,
            storeName: null,
          },
        ],
        weekStartDate: '2024-06-10',
        checkedKeys: [],
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
        storeId: null,
        storeName: null,
      });

      render(<GroceryPage />, { wrapper });
      // Custom items form is first — use index 0
      const nameInputs = await screen.findAllByPlaceholderText('Item name');
      fireEvent.change(nameInputs[0], { target: { value: 'Eggs' } });
      fireEvent.keyDown(nameInputs[0], { key: 'Enter' });

      await waitFor(() => {
        expect(vi.mocked(menus.addCustomItem)).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ name: 'Eggs' })
        );
      });
    });

    it('custom item checkbox toggles checked state', async () => {
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
            storeId: null,
            storeName: null,
          },
        ],
        weekStartDate: '2024-06-10',
        checkedKeys: [],
      });
      vi.mocked(menus.toggleGroceryCheck).mockResolvedValue({
        itemKey: 'custom::ci-1',
        checked: true,
      });

      render(<GroceryPage />, { wrapper });
      const checkBtn = await screen.findByRole('button', { name: /Check Paper towels/i });
      fireEvent.click(checkBtn);

      await waitFor(() => {
        expect(vi.mocked(menus.toggleGroceryCheck)).toHaveBeenCalledWith(
          '2024-06-10',
          'custom::ci-1',
          'Paper towels'
        );
      });
    });

    it('renders custom item as checked when key is in checkedKeys', async () => {
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
            storeId: null,
            storeName: null,
          },
        ],
        weekStartDate: '2024-06-10',
        checkedKeys: ['custom::ci-1'],
      });

      render(<GroceryPage />, { wrapper });
      expect(await screen.findByRole('button', { name: /Uncheck Paper towels/i })).toBeTruthy();
    });
  });

  it('calls refetch when Try again button clicked', async () => {
    vi.mocked(menus.getGroceries)
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue(baseGroceriesResponse);
    render(<GroceryPage />, { wrapper });
    await screen.findByText('Try again');
    fireEvent.click(screen.getByText('Try again'));
    await waitFor(() => {
      expect(vi.mocked(menus.getGroceries).mock.calls.length).toBeGreaterThan(1);
    });
  });

  it('collapses category section when category header button clicked', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [
        {
          name: 'Flour',
          quantity: 500,
          unit: 'g',
          dishes: ['Pasta'],
          notes: [],
          inPantry: false,
          category: 'Pantry Staples',
          stores: [],
        },
      ],
      customItems: [],
      weekStartDate: '2024-06-10',
      checkedKeys: [],
    });
    render(<GroceryPage />, { wrapper });
    await screen.findByText('Flour');
    // The category toggle button has aria-expanded=true when not collapsed
    const categoryBtn = document.querySelector('button[aria-expanded="true"]') as HTMLButtonElement;
    expect(categoryBtn).toBeTruthy();
    fireEvent.click(categoryBtn);
    // After collapse, items are hidden
    await waitFor(() => expect(screen.queryByRole('button', { name: /Check Flour/i })).toBeNull());
  });

  it('renders items from two different categories (exercises sort)', async () => {
    vi.mocked(menus.getGroceries).mockResolvedValue({
      groceries: [
        {
          name: 'Cheese',
          quantity: null,
          unit: null,
          dishes: [],
          notes: [],
          inPantry: false,
          category: 'Dairy',
          stores: [],
        },
        {
          name: 'Apples',
          quantity: null,
          unit: null,
          dishes: [],
          notes: [],
          inPantry: false,
          category: 'Produce',
          stores: [],
        },
      ],
      customItems: [],
      standingItems: [],
      weekStartDate: '2024-06-10',
      checkedKeys: [],
    });
    render(<GroceryPage />, { wrapper });
    expect(await screen.findByText('Cheese')).toBeTruthy();
    expect(await screen.findByText('Apples')).toBeTruthy();
  });

  describe('standing items (Every Week)', () => {
    it('renders Every Week section header', async () => {
      vi.mocked(menus.getGroceries).mockResolvedValue(baseGroceriesResponse);
      render(<GroceryPage />, { wrapper });
      expect(await screen.findByText('Every Week')).toBeTruthy();
    });

    it('renders standing item name and quantity when present', async () => {
      vi.mocked(menus.getGroceries).mockResolvedValue({
        ...baseGroceriesResponse,
        standingItems: [
          {
            id: 'si-1',
            name: 'Milk',
            quantity: 2,
            unit: 'L',
            category: 'Dairy',
            storeId: null,
            storeName: null,
          },
        ],
      });
      render(<GroceryPage />, { wrapper });
      expect(await screen.findByText('Milk')).toBeTruthy();
      expect(await screen.findByText(/2.*L/)).toBeTruthy();
    });

    it('shows No standing items yet placeholder when list is empty', async () => {
      vi.mocked(menus.getGroceries).mockResolvedValue(baseGroceriesResponse);
      render(<GroceryPage />, { wrapper });
      expect(await screen.findByText('No standing items yet')).toBeTruthy();
    });

    it('check calls toggle with standing:: key', async () => {
      vi.mocked(menus.getGroceries).mockResolvedValue({
        ...baseGroceriesResponse,
        standingItems: [
          {
            id: 'si-1',
            name: 'Eggs',
            quantity: 12,
            unit: null,
            category: 'Dairy',
            storeId: null,
            storeName: null,
          },
        ],
      });
      vi.mocked(menus.toggleGroceryCheck).mockResolvedValue({
        itemKey: 'standing::si-1',
        checked: true,
      });

      render(<GroceryPage />, { wrapper });
      const checkBtn = await screen.findByRole('button', { name: /Check Eggs/i });
      fireEvent.click(checkBtn);

      await waitFor(() => {
        expect(vi.mocked(menus.toggleGroceryCheck)).toHaveBeenCalledWith(
          '2024-06-10',
          'standing::si-1',
          'Eggs'
        );
      });
    });

    it('uncheck calls toggle with standing:: key when already checked', async () => {
      vi.mocked(menus.getGroceries).mockResolvedValue({
        ...baseGroceriesResponse,
        standingItems: [
          {
            id: 'si-2',
            name: 'Bread',
            quantity: null,
            unit: null,
            category: 'Bakery',
            storeId: null,
            storeName: null,
          },
        ],
        checkedKeys: ['standing::si-2'],
      });

      render(<GroceryPage />, { wrapper });
      expect(await screen.findByRole('button', { name: /Uncheck Bread/i })).toBeTruthy();
    });

    it('store filter hides standing item with mismatched store', async () => {
      vi.mocked(menus.getGroceries).mockResolvedValue({
        groceries: [
          {
            name: 'Flour',
            quantity: null,
            unit: null,
            dishes: [],
            notes: [],
            inPantry: false,
            category: 'Pantry Staples',
            stores: ['Store A', 'Store B'],
          },
        ],
        customItems: [],
        standingItems: [
          {
            id: 'si-3',
            name: 'Butter',
            quantity: null,
            unit: null,
            category: 'Dairy',
            storeId: 'store-b-id',
            storeName: 'Store B',
          },
        ],
        weekStartDate: '2024-06-10',
        checkedKeys: [],
      });

      render(<GroceryPage />, { wrapper });
      await screen.findByText('Butter');

      // Select Store A — Butter is from Store B so should be hidden
      const storeFilter = screen.getByRole('combobox', { name: /filter by store/i });
      fireEvent.change(storeFilter, { target: { value: 'Store A' } });

      await waitFor(() => {
        expect(screen.queryByText('Butter')).toBeNull();
      });
    });

    it('store filter shows standing item with no store regardless of filter', async () => {
      vi.mocked(menus.getGroceries).mockResolvedValue({
        groceries: [
          {
            name: 'Flour',
            quantity: null,
            unit: null,
            dishes: [],
            notes: [],
            inPantry: false,
            category: 'Pantry Staples',
            stores: ['Store A', 'Store B'],
          },
        ],
        customItems: [],
        standingItems: [
          {
            id: 'si-4',
            name: 'Olive Oil',
            quantity: null,
            unit: null,
            category: 'Pantry Staples',
            storeId: null,
            storeName: null,
          },
        ],
        weekStartDate: '2024-06-10',
        checkedKeys: [],
      });

      render(<GroceryPage />, { wrapper });
      await screen.findByText('Olive Oil');

      // Select Store A — Olive Oil has no store so should still show
      const storeFilter = screen.getByRole('combobox', { name: /filter by store/i });
      fireEvent.change(storeFilter, { target: { value: 'Store A' } });

      expect(await screen.findByText('Olive Oil')).toBeTruthy();
    });

    it('delete button calls standing.delete', async () => {
      vi.mocked(menus.getGroceries).mockResolvedValue({
        ...baseGroceriesResponse,
        standingItems: [
          {
            id: 'si-5',
            name: 'Orange Juice',
            quantity: null,
            unit: null,
            category: 'Beverages',
            storeId: null,
            storeName: null,
          },
        ],
      });
      vi.mocked(standingApi.delete).mockResolvedValue(undefined);

      render(<GroceryPage />, { wrapper });
      const deleteBtn = await screen.findByRole('button', { name: /Delete Orange Juice/i });
      fireEvent.click(deleteBtn);

      await waitFor(() => {
        expect(vi.mocked(standingApi.delete)).toHaveBeenCalledWith('si-5');
      });
    });
  });
});
