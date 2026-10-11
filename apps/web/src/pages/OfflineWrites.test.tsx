import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const { m } = vi.hoisted(() => ({
  m: {
    getGroceries: vi.fn(),
    setGroceryCheck: vi.fn(),
    addCustomItem: vi.fn(),
    deleteCustomItem: vi.fn(),
    pantryList: vi.fn(),
    pantryCreate: vi.fn(),
    pantryDelete: vi.fn(),
  },
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  menus: {
    getGroceries: m.getGroceries,
    setGroceryCheck: m.setGroceryCheck,
    addCustomItem: m.addCustomItem,
    deleteCustomItem: m.deleteCustomItem,
  },
  settings: { get: vi.fn().mockResolvedValue({ settings: { weekStartDay: 1 } }) },
  stores: { list: vi.fn().mockResolvedValue([]) },
  standing: { add: vi.fn(), delete: vi.fn() },
  pantry: { list: m.pantryList, create: m.pantryCreate, delete: m.pantryDelete },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/mobile/PullToRefresh', () => ({
  PullToRefresh: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/mobile/SwipeableListItem', () => ({
  SwipeableListItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { queryClient } from '@/lib/queryClient';
import { GroceryPage } from './GroceryPage';
import { PantryPage } from './PantryPage';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const flour = {
  name: 'Flour',
  quantity: 500,
  unit: 'g',
  dishes: ['Pasta'],
  notes: [],
  inPantry: false,
  category: 'Other',
  stores: [],
};

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  queryClient.clear();
  queryClient.setQueryData(['settings'], { settings: { weekStartDay: 1 } });
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    queries: { ...queryClient.getDefaultOptions().queries, retry: false },
  });
  vi.clearAllMocks();
  onlineManager.setOnline(false);
  m.getGroceries.mockResolvedValue({
    groceries: [flour],
    customItems: [
      {
        id: 'c-1',
        weekDate: '2024-06-10',
        name: 'Soap',
        quantity: null,
        unit: null,
        sortOrder: 0,
        storeId: null,
        storeName: null,
      },
    ],
    standingItems: [],
    weekStartDate: '2024-06-10',
    checkedKeys: [],
    checks: [],
  });
  m.setGroceryCheck.mockResolvedValue({
    itemKey: 'flour::g',
    checked: true,
    updatedAt: 1,
    checkedBy: null,
    changed: true,
  });
  m.addCustomItem.mockResolvedValue({ id: 'x' });
  m.deleteCustomItem.mockResolvedValue(undefined);
  m.pantryList.mockResolvedValue({
    items: [
      {
        id: 'p-1',
        ingredientName: 'Olive oil',
        quantity: null,
        unit: null,
        expiresAt: null,
        createdAt: '2024-01-01T00:00:00Z',
      },
    ],
  });
  m.pantryCreate.mockResolvedValue({ item: { id: 'x' } });
  m.pantryDelete.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  onlineManager.setOnline(true);
});

describe('GroceryPage offline writes', () => {
  it('shows a toggle immediately with a pending cue, and sends it once back online', async () => {
    render(<GroceryPage />, { wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Check Flour' }));

    expect(await screen.findByRole('button', { name: /^Uncheck Flour/ })).toBeTruthy();
    expect(screen.getAllByText('Waiting to sync').length).toBeGreaterThan(0);
    expect(m.setGroceryCheck).not.toHaveBeenCalled();

    await act(async () => {
      onlineManager.setOnline(true);
      await queryClient.resumePausedMutations();
    });
    await waitFor(() =>
      expect(m.setGroceryCheck).toHaveBeenCalledWith(
        expect.objectContaining({ weekDate: '2024-06-10', itemKey: 'flour::g', checked: true })
      )
    );
  });

  it('adds a custom item offline: shown pending right away, created with a client uuid on reconnect', async () => {
    render(<GroceryPage />, { wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Add item' }));
    fireEvent.change(await screen.findByLabelText(/Item name/), { target: { value: 'Towels' } });
    fireEvent.submit(screen.getByLabelText(/Item name/).closest('form')!);

    expect(await screen.findByText('Towels')).toBeTruthy();
    expect(m.addCustomItem).not.toHaveBeenCalled();

    await act(async () => {
      onlineManager.setOnline(true);
      await queryClient.resumePausedMutations();
    });
    await waitFor(() => expect(m.addCustomItem).toHaveBeenCalledTimes(1));
    const [weekDate, body] = m.addCustomItem.mock.calls[0];
    expect(weekDate).toBe('2024-06-10');
    expect(body).toMatchObject({ name: 'Towels' });
    expect(body.id).toMatch(UUID);
  });

  it('hides a deleted custom item immediately and deletes it on reconnect', async () => {
    render(<GroceryPage />, { wrapper });
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Soap' }));
    await waitFor(() => expect(screen.queryByText('Soap')).toBeNull());
    expect(m.deleteCustomItem).not.toHaveBeenCalled();

    await act(async () => {
      onlineManager.setOnline(true);
      await queryClient.resumePausedMutations();
    });
    await waitFor(() => expect(m.deleteCustomItem).toHaveBeenCalledWith('c-1'));
  });
});

describe('PantryPage offline writes', () => {
  it('adds an item offline: shown pending, created with a client uuid on reconnect', async () => {
    render(<PantryPage />, { wrapper });
    await screen.findByText('Olive oil');
    fireEvent.click(screen.getByRole('button', { name: /Add Item/ }));
    fireEvent.change(screen.getByLabelText(/Ingredient/), { target: { value: 'Rice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to Pantry' }));

    expect(await screen.findByText('Rice')).toBeTruthy();
    expect(screen.getAllByText('Waiting to sync').length).toBe(1);
    expect(m.pantryCreate).not.toHaveBeenCalled();

    await act(async () => {
      onlineManager.setOnline(true);
      await queryClient.resumePausedMutations();
    });
    await waitFor(() => expect(m.pantryCreate).toHaveBeenCalledTimes(1));
    expect(m.pantryCreate.mock.calls[0][0]).toMatchObject({ ingredientName: 'Rice' });
    expect(m.pantryCreate.mock.calls[0][0].id).toMatch(UUID);
  });

  it('removes an item offline: hidden right away, deleted on reconnect', async () => {
    render(<PantryPage />, { wrapper });
    fireEvent.click(await screen.findByRole('button', { name: /Delete Olive oil from pantry/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(screen.queryByText('Olive oil')).toBeNull());
    expect(m.pantryDelete).not.toHaveBeenCalled();

    await act(async () => {
      onlineManager.setOnline(true);
      await queryClient.resumePausedMutations();
    });
    await waitFor(() => expect(m.pantryDelete).toHaveBeenCalledWith('p-1'));
  });
});
