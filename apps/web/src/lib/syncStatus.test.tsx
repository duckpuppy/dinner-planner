import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';

const { mockSetCheck } = vi.hoisted(() => ({ mockSetCheck: vi.fn() }));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  menus: { setGroceryCheck: mockSetCheck },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }));

import { ApiError } from './api';
import { queryClient } from './queryClient';
import { enqueue } from './offlineMutations';
import { clearFailed, getFailed } from './failedSyncStore';
import { retryFailed, useFailedSyncCount, usePendingSyncCount } from './syncStatus';
import { OfflineBanner } from '@/components/OfflineBanner';

function Counts() {
  return (
    <div>
      <span data-testid="pending">{usePendingSyncCount()}</span>
      <span data-testid="failed">{useFailedSyncCount()}</span>
    </div>
  );
}

function renderWith(node: React.ReactNode) {
  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

const vars = (itemKey: string) => ({
  weekDate: '2024-06-10',
  itemKey,
  itemName: itemKey,
  checked: true,
  clientUpdatedAt: 1,
});

beforeEach(() => {
  queryClient.clear();
  clearFailed();
  vi.clearAllMocks();
  onlineManager.setOnline(true);
});

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
});

describe('sync status counts', () => {
  it('counts pending offline mutations and falls back to zero when they sync', async () => {
    mockSetCheck.mockImplementation(async (v: { itemKey: string }) => ({
      itemKey: v.itemKey,
      checked: true,
      updatedAt: 1,
      checkedBy: null,
      changed: true,
    }));
    renderWith(<Counts />);
    expect(screen.getByTestId('pending').textContent).toBe('0');

    onlineManager.setOnline(false);
    act(() => {
      void enqueue('checkSet', vars('a'));
      void enqueue('checkSet', vars('b'));
    });
    await vi.waitFor(() => expect(screen.getByTestId('pending').textContent).toBe('2'));

    await act(async () => {
      onlineManager.setOnline(true);
      await queryClient.resumePausedMutations();
    });
    await vi.waitFor(() => expect(screen.getByTestId('pending').textContent).toBe('0'));
  });

  it('counts failed changes, and retryFailed re-enqueues them', async () => {
    mockSetCheck.mockRejectedValueOnce(new ApiError(400, 'nope')).mockResolvedValue({
      itemKey: 'a',
      checked: true,
      updatedAt: 1,
      checkedBy: null,
      changed: true,
    });
    renderWith(<Counts />);
    await act(async () => {
      await enqueue('checkSet', vars('a'));
    });
    expect(screen.getByTestId('failed').textContent).toBe('1');

    await act(async () => {
      retryFailed();
    });
    expect(screen.getByTestId('failed').textContent).toBe('0');
    await vi.waitFor(() => expect(mockSetCheck).toHaveBeenCalledTimes(2));
    expect(getFailed()).toHaveLength(0);
  });
});

describe('OfflineBanner with the real counts', () => {
  it('shows the syncing count while changes are queued', async () => {
    onlineManager.setOnline(false);
    // Online status is mocked true above so the "syncing" branch renders.
    void enqueue('checkSet', vars('a'));
    void enqueue('checkSet', vars('b'));
    void enqueue('checkSet', vars('c'));
    renderWith(<OfflineBanner />);
    expect(await screen.findByText(/Syncing 3 changes/)).toBeTruthy();
  });

  it('shows the failed banner and its Retry button re-enqueues', async () => {
    mockSetCheck
      .mockRejectedValueOnce(new ApiError(422, 'bad'))
      .mockReturnValue(new Promise(() => {}));
    renderWith(<OfflineBanner />);
    await act(async () => {
      await enqueue('checkSet', vars('a'));
    });
    expect(screen.getByText(/1 change failed to sync/)).toBeTruthy();

    await act(async () => {
      screen.getByRole('button', { name: 'Retry' }).click();
    });
    expect(getFailed()).toHaveLength(0);
    expect(mockSetCheck).toHaveBeenCalledTimes(2);
  });
});
