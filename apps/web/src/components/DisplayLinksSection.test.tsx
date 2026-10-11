import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DisplayLinksSection } from './DisplayLinksSection';

const { mockList, mockCreate, mockRevoke } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockCreate: vi.fn(),
  mockRevoke: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  displayLinks: { list: mockList, create: mockCreate, revoke: mockRevoke },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from 'sonner';

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DisplayLinksSection />
    </QueryClientProvider>
  );
}

const link = {
  id: 'l1',
  name: 'Kitchen tablet',
  createdByUserId: 'u1',
  lastUsedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  createdAt: '2026-06-01T12:00:00.000Z',
};

beforeEach(() => {
  mockList.mockResolvedValue({ displayLinks: [link] });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DisplayLinksSection', () => {
  it('lists links with last-used time', async () => {
    mockList.mockResolvedValue({
      displayLinks: [link, { ...link, id: 'l2', name: 'Hall TV', lastUsedAt: null }],
    });
    renderSection();
    expect(await screen.findByText('Kitchen tablet')).toBeInTheDocument();
    expect(screen.getByText('5m ago')).toBeInTheDocument();
    expect(screen.getByText('Never')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    mockList.mockResolvedValue({ displayLinks: [] });
    renderSection();
    expect(await screen.findByText('No display links yet.')).toBeInTheDocument();
  });

  it('shows an error with retry', async () => {
    mockList.mockRejectedValueOnce(new Error('boom'));
    renderSection();
    expect(await screen.findByText('Failed to load display links.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Kitchen tablet')).toBeInTheDocument();
  });

  it('creates a link, shows the absolute URL once and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mockCreate.mockResolvedValue({
      id: 'l3',
      name: 'Wall',
      token: 'dpk_secret',
      url: '/kiosk?key=dpk_secret',
      createdAt: '2026-06-10T00:00:00.000Z',
    });
    renderSection();
    await screen.findByText('Kitchen tablet');

    await userEvent.click(screen.getByRole('button', { name: /create link/i }));
    await userEvent.type(screen.getByLabelText('Name'), '  Wall ');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    const expected = `${window.location.origin}/kiosk?key=dpk_secret`;
    expect(await screen.findByTestId('display-link-url')).toHaveTextContent(expected);
    expect(mockCreate).toHaveBeenCalledWith({ name: 'Wall' });

    await userEvent.click(screen.getByRole('button', { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith(expected);
    expect(await screen.findByText('Copied')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('display-link-url')).not.toBeInTheDocument();
  });

  it('reports a copy failure and a create failure', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
      configurable: true,
    });
    mockCreate.mockRejectedValueOnce(new Error('fail'));
    renderSection();
    await screen.findByText('Kitchen tablet');
    await userEvent.click(screen.getByRole('button', { name: /create link/i }));
    await userEvent.type(screen.getByLabelText('Name'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to create display link'));

    mockCreate.mockResolvedValueOnce({
      id: 'l4',
      name: 'X',
      token: 't',
      url: '/kiosk?key=t',
      createdAt: '',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await userEvent.click(await screen.findByRole('button', { name: /copy/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to copy display link'));
  });

  it('can cancel creation', async () => {
    renderSection();
    await screen.findByText('Kitchen tablet');
    await userEvent.click(screen.getByRole('button', { name: /create link/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('revokes only after confirmation', async () => {
    mockRevoke.mockResolvedValue({ success: true });
    renderSection();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Revoke display link Kitchen tablet' })
    );
    expect(mockRevoke).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(mockRevoke.mock.calls[0][0]).toBe('l1'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Display link revoked'));
  });

  it('reports a revoke failure', async () => {
    mockRevoke.mockRejectedValue(new Error('x'));
    renderSection();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Revoke display link Kitchen tablet' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to revoke display link'));
  });
});
