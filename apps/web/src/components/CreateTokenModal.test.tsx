import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreateTokenModal } from './CreateTokenModal';

vi.mock('@/lib/api', () => ({
  apiTokens: {
    create: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { apiTokens } from '@/lib/api';
import { toast } from 'sonner';

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('CreateTokenModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders form in phase 1', () => {
    render(<CreateTokenModal onClose={onClose} />, { wrapper });
    expect(screen.getByText('Create API Token')).toBeTruthy();
    expect(screen.getByPlaceholderText(/Home Assistant/i)).toBeTruthy();
    expect(screen.getByText('Create Token')).toBeTruthy();
  });

  it('calls onClose when Cancel is clicked', () => {
    render(<CreateTokenModal onClose={onClose} />, { wrapper });
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when X button is clicked', () => {
    render(<CreateTokenModal onClose={onClose} />, { wrapper });
    fireEvent.click(
      screen.getByTitle
        ? document.querySelector('button.text-muted-foreground')!
        : screen.getByRole('button', { name: /close/i })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('disables submit when name is empty', () => {
    render(<CreateTokenModal onClose={onClose} />, { wrapper });
    const submitBtn = screen.getByText('Create Token');
    expect(submitBtn.closest('button')).toHaveProperty('disabled', true);
  });

  it('enables submit when name is entered', () => {
    render(<CreateTokenModal onClose={onClose} />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/Home Assistant/i), {
      target: { value: 'My Token' },
    });
    const submitBtn = screen.getByText('Create Token');
    expect(submitBtn.closest('button')).toHaveProperty('disabled', false);
  });

  it('shows token reveal phase after successful creation', async () => {
    vi.mocked(apiTokens.create).mockResolvedValueOnce({
      id: 'tok-1',
      name: 'My Token',
      token: 'dp_abc123',
      expiresAt: null,
    });

    render(<CreateTokenModal onClose={onClose} />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/Home Assistant/i), {
      target: { value: 'My Token' },
    });
    fireEvent.click(screen.getByText('Create Token'));

    await waitFor(() => {
      expect(screen.getByText('Token Created')).toBeTruthy();
    });
    expect(screen.getByText('dp_abc123')).toBeTruthy();
    expect(screen.getByText(/will not be shown again/i)).toBeTruthy();
  });

  it('shows error toast on creation failure', async () => {
    vi.mocked(apiTokens.create).mockRejectedValueOnce(new Error('Server error'));

    render(<CreateTokenModal onClose={onClose} />, { wrapper });
    fireEvent.change(screen.getByPlaceholderText(/Home Assistant/i), {
      target: { value: 'My Token' },
    });
    fireEvent.click(screen.getByText('Create Token'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to create API token');
    });
  });

  it('calls onClose on Escape key in phase 1', () => {
    render(<CreateTokenModal onClose={onClose} />, { wrapper });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
