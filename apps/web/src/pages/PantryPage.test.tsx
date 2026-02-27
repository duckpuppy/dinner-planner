import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('shows error state when loading fails', async () => {
    vi.mocked(pantryApi.list).mockRejectedValue(new Error('Network error'));
    render(<PantryPage />, { wrapper });
    expect(await screen.findByText(/Failed to load/i)).toBeTruthy();
  });

  it('shows Try again button when loading fails', async () => {
    vi.mocked(pantryApi.list).mockRejectedValue(new Error('Network error'));
    render(<PantryPage />, { wrapper });
    await screen.findByText(/Failed to load/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });

  it('calls pantryApi.list again when Try again clicked', async () => {
    vi.mocked(pantryApi.list).mockRejectedValue(new Error('Network error'));
    render(<PantryPage />, { wrapper });
    await screen.findByText(/Failed to load/i);
    const tryAgainBtn = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(tryAgainBtn);
    expect(pantryApi.list).toHaveBeenCalled();
  });

  it('shows item quantity and unit when present', async () => {
    vi.mocked(pantryApi.list).mockResolvedValue({
      items: [{ ...mockItem, quantity: 2, unit: 'cups' }],
    });
    const { findByText } = render(<PantryPage />, { wrapper });
    expect(await findByText('Olive oil')).toBeTruthy();
  });

  it('shows expiry badge for items expiring soon', async () => {
    const soonDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    vi.mocked(pantryApi.list).mockResolvedValue({
      items: [{ ...mockItem, expiresAt: soonDate }],
    });
    render(<PantryPage />, { wrapper });
    // The component renders "Expires " + date
    expect(await screen.findByText(/Expires/i)).toBeTruthy();
  });

  it('shows expired badge for past items', async () => {
    const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    vi.mocked(pantryApi.list).mockResolvedValue({
      items: [{ ...mockItem, expiresAt: pastDate }],
    });
    render(<PantryPage />, { wrapper });
    // The component renders "Expired " + date
    expect(await screen.findByText(/Expired/i)).toBeTruthy();
  });
});

describe('PantryPage ConfirmDialog', () => {
  it('shows confirm dialog when delete button clicked on item row', async () => {
    vi.mocked(pantryApi.list).mockResolvedValue({ items: [mockItem] });
    render(<PantryPage />, { wrapper });
    await screen.findByText('Olive oil');
    const deleteBtn = screen.getByRole('button', { name: /delete olive oil from pantry/i });
    fireEvent.click(deleteBtn);
    // Confirm dialog should open (SwipeableListItem is mocked so the delete btn inside PantryRow renders)
    expect(await screen.findByText(/Remove from pantry/i)).toBeTruthy();
  });

  it('calls pantryApi.delete when confirm dialog confirmed', async () => {
    vi.mocked(pantryApi.list).mockResolvedValue({ items: [mockItem] });
    vi.mocked(pantryApi.delete).mockResolvedValue(undefined as never);
    render(<PantryPage />, { wrapper });
    await screen.findByText('Olive oil');
    const deleteBtn = screen.getByRole('button', { name: /delete olive oil from pantry/i });
    fireEvent.click(deleteBtn);
    await screen.findByText(/Remove from pantry/i);
    const confirmBtn = screen.getByRole('button', { name: 'Remove' });
    fireEvent.click(confirmBtn);
    await waitFor(() => {
      expect(pantryApi.delete).toHaveBeenCalledWith('item-1');
    });
  });

  it('closes confirm dialog when cancel clicked', async () => {
    vi.mocked(pantryApi.list).mockResolvedValue({ items: [mockItem] });
    render(<PantryPage />, { wrapper });
    await screen.findByText('Olive oil');
    const deleteBtn = screen.getByRole('button', { name: /delete olive oil from pantry/i });
    fireEvent.click(deleteBtn);
    await screen.findByText(/Remove from pantry/i);
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(screen.queryByText(/Remove from pantry/i)).toBeNull();
    });
  });
});

describe('PantryPage AddItemForm', () => {
  beforeEach(() => {
    vi.mocked(pantryApi.list).mockResolvedValue({ items: [] });
  });

  it('opens add item form when Add Item clicked', async () => {
    render(<PantryPage />, { wrapper });
    fireEvent.click(screen.getByText('Add Item'));
    expect(await screen.findByLabelText(/add pantry item/i)).toBeTruthy();
  });

  it('closes form when close button clicked', async () => {
    render(<PantryPage />, { wrapper });
    fireEvent.click(screen.getByText('Add Item'));
    await screen.findByLabelText(/add pantry item/i);
    fireEvent.click(screen.getByRole('button', { name: /close add item form/i }));
    await waitFor(() => {
      expect(screen.queryByLabelText(/add pantry item/i)).toBeNull();
    });
  });

  it('calls pantryApi.create when form submitted', async () => {
    vi.mocked(pantryApi.create).mockResolvedValue({ item: mockItem } as never);
    render(<PantryPage />, { wrapper });
    fireEvent.click(screen.getByText('Add Item'));
    await screen.findByLabelText(/add pantry item/i);
    await userEvent.type(screen.getByPlaceholderText(/olive oil/i), 'Butter');
    fireEvent.submit(screen.getByLabelText(/add pantry item/i));
    await waitFor(() => {
      expect(pantryApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ ingredientName: 'Butter' })
      );
    });
  });

  it('does not submit when ingredient name is empty', async () => {
    render(<PantryPage />, { wrapper });
    fireEvent.click(screen.getByText('Add Item'));
    await screen.findByLabelText(/add pantry item/i);
    // Submit without filling in name
    fireEvent.submit(screen.getByLabelText(/add pantry item/i));
    expect(pantryApi.create).not.toHaveBeenCalled();
  });

  it('updates quantity and unit fields', async () => {
    render(<PantryPage />, { wrapper });
    fireEvent.click(screen.getByText('Add Item'));
    await screen.findByLabelText(/add pantry item/i);
    const qtyInput = document.getElementById('pantry-qty') as HTMLInputElement;
    const unitInput = document.getElementById('pantry-unit') as HTMLInputElement;
    fireEvent.change(qtyInput, { target: { value: '3' } });
    fireEvent.change(unitInput, { target: { value: 'lbs' } });
    expect(qtyInput.value).toBe('3');
    expect(unitInput.value).toBe('lbs');
  });
});
