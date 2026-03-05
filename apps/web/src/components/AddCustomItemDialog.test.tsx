import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AddCustomItemDialog } from './AddCustomItemDialog';

vi.mock('@/lib/api', () => ({
  menus: {
    addCustomItem: vi.fn(),
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

const baseProps = {
  weekDate: '2024-06-10',
  stores: [],
  onClose: vi.fn(),
};

describe('AddCustomItemDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the dialog with title', () => {
    render(<AddCustomItemDialog {...baseProps} />, { wrapper });
    expect(screen.getByRole('dialog', { name: /Add custom item/i })).toBeTruthy();
    expect(screen.getByText('Add Item')).toBeTruthy();
  });

  it('renders name, quantity, and unit fields', () => {
    render(<AddCustomItemDialog {...baseProps} />, { wrapper });
    expect(screen.getByLabelText(/Item name/i)).toBeTruthy();
    expect(screen.getByLabelText(/Quantity/i)).toBeTruthy();
    expect(screen.getByLabelText(/Unit/i)).toBeTruthy();
  });

  it('does not render store select when no stores provided', () => {
    render(<AddCustomItemDialog {...baseProps} stores={[]} />, { wrapper });
    expect(screen.queryByLabelText(/Store/i)).toBeNull();
  });

  it('renders store select when stores are provided', () => {
    render(<AddCustomItemDialog {...baseProps} stores={[{ id: 's1', name: 'Whole Foods' }]} />, {
      wrapper,
    });
    expect(screen.getByLabelText(/Store/i)).toBeTruthy();
    expect(screen.getByText('Whole Foods')).toBeTruthy();
  });

  it('Add item button is disabled when name is empty', () => {
    render(<AddCustomItemDialog {...baseProps} />, { wrapper });
    const addBtn = screen.getByRole('button', { name: /Add item/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('Add item button is enabled when name has value', async () => {
    render(<AddCustomItemDialog {...baseProps} />, { wrapper });
    fireEvent.change(screen.getByLabelText(/Item name/i), { target: { value: 'Apples' } });
    const addBtn = screen.getByRole('button', { name: /Add item/i });
    expect((addBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('calls menus.addCustomItem with name on submit', async () => {
    vi.mocked(menus.addCustomItem).mockResolvedValue({
      id: 'ci-new',
      weekDate: '2024-06-10',
      name: 'Apples',
      quantity: null,
      unit: null,
      sortOrder: 0,
      storeId: null,
      storeName: null,
    });

    render(<AddCustomItemDialog {...baseProps} />, { wrapper });
    fireEvent.change(screen.getByLabelText(/Item name/i), { target: { value: 'Apples' } });
    fireEvent.click(screen.getByRole('button', { name: /Add item/i }));

    await waitFor(() => {
      expect(vi.mocked(menus.addCustomItem)).toHaveBeenCalledWith(
        '2024-06-10',
        expect.objectContaining({ name: 'Apples' })
      );
    });
  });

  it('calls menus.addCustomItem with quantity and unit when provided', async () => {
    vi.mocked(menus.addCustomItem).mockResolvedValue({
      id: 'ci-new',
      weekDate: '2024-06-10',
      name: 'Milk',
      quantity: 2,
      unit: 'L',
      sortOrder: 0,
      storeId: null,
      storeName: null,
    });

    render(<AddCustomItemDialog {...baseProps} />, { wrapper });
    fireEvent.change(screen.getByLabelText(/Item name/i), { target: { value: 'Milk' } });
    fireEvent.change(screen.getByLabelText(/Quantity/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Unit/i), { target: { value: 'L' } });
    fireEvent.click(screen.getByRole('button', { name: /Add item/i }));

    await waitFor(() => {
      expect(vi.mocked(menus.addCustomItem)).toHaveBeenCalledWith(
        '2024-06-10',
        expect.objectContaining({ name: 'Milk', quantity: 2, unit: 'L' })
      );
    });
  });

  it('calls onClose after successful submit', async () => {
    const onClose = vi.fn();
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

    render(<AddCustomItemDialog {...baseProps} onClose={onClose} />, { wrapper });
    fireEvent.change(screen.getByLabelText(/Item name/i), { target: { value: 'Eggs' } });
    fireEvent.click(screen.getByRole('button', { name: /Add item/i }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('calls onClose when Cancel button clicked', () => {
    const onClose = vi.fn();
    render(<AddCustomItemDialog {...baseProps} onClose={onClose} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Close dialog button clicked', () => {
    const onClose = vi.fn();
    render(<AddCustomItemDialog {...baseProps} onClose={onClose} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: /Close dialog/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Escape key pressed', () => {
    const onClose = vi.fn();
    render(<AddCustomItemDialog {...baseProps} onClose={onClose} />, { wrapper });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<AddCustomItemDialog {...baseProps} onClose={onClose} />, {
      wrapper,
    });
    // The backdrop is the fixed inset-0 bg-black/50 div (first child of portal)
    const backdrop = container.ownerDocument.querySelector('.fixed.inset-0.bg-black\\/50');
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
