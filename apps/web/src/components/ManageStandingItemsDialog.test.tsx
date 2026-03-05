import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ManageStandingItemsDialog } from './ManageStandingItemsDialog';

vi.mock('@/lib/api', () => ({
  standing: {
    add: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { standing as standingApi } from '@/lib/api';

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const baseProps = {
  standingItems: [],
  stores: [],
  onClose: vi.fn(),
};

const sampleItem = {
  id: 'si-1',
  name: 'Milk',
  quantity: 2,
  unit: 'L',
  category: 'Dairy',
  storeId: null,
  storeName: null,
};

describe('ManageStandingItemsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the dialog with title', () => {
    render(<ManageStandingItemsDialog {...baseProps} />, { wrapper });
    expect(screen.getByRole('dialog', { name: /Manage recurring items/i })).toBeTruthy();
    expect(screen.getByText('Recurring Items')).toBeTruthy();
  });

  it('shows empty state message when no standing items', () => {
    render(<ManageStandingItemsDialog {...baseProps} standingItems={[]} />, { wrapper });
    expect(screen.getByText(/No recurring items yet/i)).toBeTruthy();
  });

  it('renders existing standing items', () => {
    render(<ManageStandingItemsDialog {...baseProps} standingItems={[sampleItem]} />, { wrapper });
    expect(screen.getByText('Milk')).toBeTruthy();
  });

  it('renders item with quantity and unit', () => {
    render(<ManageStandingItemsDialog {...baseProps} standingItems={[sampleItem]} />, { wrapper });
    expect(screen.getByText(/2.*L/)).toBeTruthy();
  });

  it('renders item category badge', () => {
    render(<ManageStandingItemsDialog {...baseProps} standingItems={[sampleItem]} />, { wrapper });
    expect(screen.getByText('Dairy')).toBeTruthy();
  });

  it('renders delete button for each item', () => {
    render(<ManageStandingItemsDialog {...baseProps} standingItems={[sampleItem]} />, { wrapper });
    expect(screen.getByRole('button', { name: /Delete Milk/i })).toBeTruthy();
  });

  it('shows ConfirmDialog when delete button clicked', async () => {
    render(<ManageStandingItemsDialog {...baseProps} standingItems={[sampleItem]} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /Delete Milk/i }));
    expect(await screen.findByText(/Delete recurring item/i)).toBeTruthy();
    expect(await screen.findByText(/Remove "Milk"/i)).toBeTruthy();
  });

  it('calls standing.delete when confirm clicked in ConfirmDialog', async () => {
    vi.mocked(standingApi.delete).mockResolvedValue(undefined);

    render(<ManageStandingItemsDialog {...baseProps} standingItems={[sampleItem]} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /Delete Milk/i }));
    const confirmBtn = await screen.findByRole('button', { name: /^Delete$/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(vi.mocked(standingApi.delete)).toHaveBeenCalledWith('si-1');
    });
  });

  it('cancels delete when Cancel clicked in ConfirmDialog', async () => {
    render(<ManageStandingItemsDialog {...baseProps} standingItems={[sampleItem]} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /Delete Milk/i }));
    await screen.findByText(/Delete recurring item/i);
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Delete recurring item/i)).toBeNull();
    });
    expect(vi.mocked(standingApi.delete)).not.toHaveBeenCalled();
  });

  it('renders add form fields', () => {
    render(<ManageStandingItemsDialog {...baseProps} />, { wrapper });
    expect(screen.getByLabelText(/Item name/i)).toBeTruthy();
    expect(screen.getByLabelText(/Quantity/i)).toBeTruthy();
    expect(screen.getByLabelText(/Unit/i)).toBeTruthy();
    expect(screen.getByLabelText(/Category/i)).toBeTruthy();
  });

  it('Add button is disabled when name is empty', () => {
    render(<ManageStandingItemsDialog {...baseProps} />, { wrapper });
    const addBtn = screen.getByRole('button', { name: /^Add$/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('Add button is enabled when name has value', () => {
    render(<ManageStandingItemsDialog {...baseProps} />, { wrapper });
    fireEvent.change(screen.getByLabelText(/Item name/i), { target: { value: 'Eggs' } });
    const addBtn = screen.getByRole('button', { name: /^Add$/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('calls standing.add with name and category on submit', async () => {
    vi.mocked(standingApi.add).mockResolvedValue({
      id: 'si-new',
      name: 'Eggs',
      quantity: null,
      unit: null,
      category: 'Other',
      storeId: null,
      storeName: null,
    });

    render(<ManageStandingItemsDialog {...baseProps} />, { wrapper });
    fireEvent.change(screen.getByLabelText(/Item name/i), { target: { value: 'Eggs' } });
    fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));

    await waitFor(() => {
      expect(vi.mocked(standingApi.add)).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Eggs', category: 'Other' })
      );
    });
  });

  it('clears add form after successful submit', async () => {
    vi.mocked(standingApi.add).mockResolvedValue({
      id: 'si-new',
      name: 'Eggs',
      quantity: null,
      unit: null,
      category: 'Other',
      storeId: null,
      storeName: null,
    });

    render(<ManageStandingItemsDialog {...baseProps} />, { wrapper });
    const nameInput = screen.getByLabelText(/Item name/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Eggs' } });
    fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));

    await waitFor(() => {
      expect(nameInput.value).toBe('');
    });
  });

  it('does not render store select when no stores provided', () => {
    render(<ManageStandingItemsDialog {...baseProps} stores={[]} />, { wrapper });
    expect(screen.queryByLabelText(/Store/i)).toBeNull();
  });

  it('renders store select when stores are provided', () => {
    render(
      <ManageStandingItemsDialog {...baseProps} stores={[{ id: 's1', name: 'Trader Joes' }]} />,
      { wrapper }
    );
    expect(screen.getByLabelText(/Store/i)).toBeTruthy();
    expect(screen.getByText('Trader Joes')).toBeTruthy();
  });

  it('calls onClose when Close button clicked', () => {
    const onClose = vi.fn();
    render(<ManageStandingItemsDialog {...baseProps} onClose={onClose} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /^Close$/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Close dialog button clicked', () => {
    const onClose = vi.fn();
    render(<ManageStandingItemsDialog {...baseProps} onClose={onClose} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /Close dialog/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape key pressed (no confirm dialog open)', () => {
    const onClose = vi.fn();
    render(<ManageStandingItemsDialog {...baseProps} onClose={onClose} />, { wrapper });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('renders item storeName badge when item has store', () => {
    render(
      <ManageStandingItemsDialog
        {...baseProps}
        standingItems={[{ ...sampleItem, storeId: 's1', storeName: 'Costco' }]}
      />,
      { wrapper }
    );
    expect(screen.getByText('Costco')).toBeTruthy();
  });
});
