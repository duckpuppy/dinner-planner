import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiTokensSection } from './ApiTokensSection';

vi.mock('@/lib/api', () => ({
  apiTokens: {
    list: vi.fn(),
    revoke: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/CreateTokenModal', () => ({
  CreateTokenModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="create-token-modal">
      <button onClick={onClose}>Close Modal</button>
    </div>
  ),
}));

import { apiTokens } from '@/lib/api';
import { toast } from 'sonner';

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const mockTokens = [
  {
    id: 'tok-1',
    name: 'Home Assistant',
    createdAt: '2026-04-01T00:00:00.000Z',
    lastUsedAt: null,
    expiresAt: null,
  },
  {
    id: 'tok-2',
    name: 'Scripts',
    createdAt: '2026-03-01T00:00:00.000Z',
    lastUsedAt: '2026-04-04T00:00:00.000Z',
    expiresAt: '2026-07-01T00:00:00.000Z',
  },
];

describe('ApiTokensSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows empty state when no tokens', async () => {
    vi.mocked(apiTokens.list).mockResolvedValueOnce({ tokens: [] });
    render(<ApiTokensSection />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('No API tokens yet.')).toBeTruthy();
    });
  });

  it('renders token list', async () => {
    vi.mocked(apiTokens.list).mockResolvedValueOnce({ tokens: mockTokens });
    render(<ApiTokensSection />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Home Assistant')).toBeTruthy();
      expect(screen.getByText('Scripts')).toBeTruthy();
    });
  });

  it('shows Never for tokens with no expiry', async () => {
    vi.mocked(apiTokens.list).mockResolvedValueOnce({ tokens: mockTokens });
    render(<ApiTokensSection />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Never')).toBeTruthy();
    });
  });

  it('opens create modal when Create Token is clicked', async () => {
    vi.mocked(apiTokens.list).mockResolvedValueOnce({ tokens: [] });
    render(<ApiTokensSection />, { wrapper });
    await waitFor(() => screen.getByText('No API tokens yet.'));
    fireEvent.click(screen.getByText('Create Token'));
    expect(screen.getByTestId('create-token-modal')).toBeTruthy();
  });

  it('closes create modal when modal calls onClose', async () => {
    vi.mocked(apiTokens.list).mockResolvedValueOnce({ tokens: [] });
    render(<ApiTokensSection />, { wrapper });
    await waitFor(() => screen.getByText('No API tokens yet.'));
    fireEvent.click(screen.getByText('Create Token'));
    fireEvent.click(screen.getByText('Close Modal'));
    expect(screen.queryByTestId('create-token-modal')).toBeNull();
  });

  it('opens confirm dialog when Revoke is clicked', async () => {
    vi.mocked(apiTokens.list).mockResolvedValueOnce({ tokens: mockTokens });
    render(<ApiTokensSection />, { wrapper });
    await waitFor(() => screen.getByText('Home Assistant'));
    const revokeButtons = screen.getAllByTitle('Revoke token');
    fireEvent.click(revokeButtons[0]);
    expect(screen.getByText('Revoke token')).toBeTruthy();
    expect(screen.getByText(/Revoke "Home Assistant"/i)).toBeTruthy();
  });

  it('calls revoke API and shows success toast on confirm', async () => {
    vi.mocked(apiTokens.list).mockResolvedValue({ tokens: mockTokens });
    vi.mocked(apiTokens.revoke).mockResolvedValueOnce({ success: true });
    render(<ApiTokensSection />, { wrapper });
    await waitFor(() => screen.getByText('Home Assistant'));
    fireEvent.click(screen.getAllByTitle('Revoke token')[0]);
    fireEvent.click(screen.getByText('Revoke'));
    await waitFor(() => {
      expect(apiTokens.revoke).toHaveBeenCalledWith('tok-1');
      expect(toast.success).toHaveBeenCalledWith('Token revoked');
    });
  });

  it('shows error message and retry button when list fails', async () => {
    vi.mocked(apiTokens.list).mockRejectedValueOnce(new Error('Network error'));
    render(<ApiTokensSection />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Failed to load API tokens.')).toBeTruthy();
      expect(screen.getByText('Try again')).toBeTruthy();
    });
  });

  it('closes revoke dialog when Cancel is clicked', async () => {
    vi.mocked(apiTokens.list).mockResolvedValueOnce({ tokens: mockTokens });
    render(<ApiTokensSection />, { wrapper });
    await waitFor(() => screen.getByText('Home Assistant'));
    fireEvent.click(screen.getAllByTitle('Revoke token')[0]);
    expect(screen.getByText(/Revoke "Home Assistant"/i)).toBeTruthy();
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByText(/Revoke "Home Assistant"/i)).toBeNull();
    });
  });

  it('shows error toast when revoke fails', async () => {
    vi.mocked(apiTokens.list).mockResolvedValue({ tokens: mockTokens });
    vi.mocked(apiTokens.revoke).mockRejectedValueOnce(new Error('Server error'));
    render(<ApiTokensSection />, { wrapper });
    await waitFor(() => screen.getByText('Home Assistant'));
    fireEvent.click(screen.getAllByTitle('Revoke token')[0]);
    fireEvent.click(screen.getByText('Revoke'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to revoke token');
    });
  });
});
