import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  menus: { setGroceryCheck: vi.fn(() => new Promise(() => {})) },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { queryClient } from '@/lib/queryClient';
import { enqueue } from '@/lib/offlineMutations';
import { clearFailed, recordFailed } from '@/lib/failedSyncStore';
import { useLogoutGuard } from './useLogoutGuard';

const logout = vi.fn();

function Harness() {
  const { requestLogout, dialog } = useLogoutGuard(logout);
  return (
    <>
      <button onClick={requestLogout}>Sign out</button>
      {dialog}
    </>
  );
}

function renderHarness() {
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>
  );
}

// TanStack batches its notifications on a timer, so give the subscribers a tick.
const queueChange = () =>
  act(async () => {
    void enqueue('checkSet', {
      weekDate: '2024-06-10',
      itemKey: 'a',
      itemName: 'A',
      checked: true,
      clientUpdatedAt: 1,
    });
    await new Promise((r) => setTimeout(r, 10));
  });

beforeEach(() => {
  queryClient.clear();
  clearFailed();
  logout.mockReset();
  onlineManager.setOnline(true);
});

afterEach(() => cleanup());

describe('useLogoutGuard', () => {
  it('signs out straight away when nothing is unsynced', () => {
    renderHarness();
    fireEvent.click(screen.getByText('Sign out'));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/unsynced/)).toBeNull();
  });

  it('asks for confirmation when changes are pending, and Cancel keeps the session', async () => {
    onlineManager.setOnline(false);
    renderHarness();
    await queueChange();

    fireEvent.click(screen.getByText('Sign out'));
    expect(logout).not.toHaveBeenCalled();
    expect(
      screen.getByText('You have 1 unsynced change. Signing out will discard it.')
    ).toBeTruthy();

    fireEvent.click(screen.getByText('Cancel'));
    expect(logout).not.toHaveBeenCalled();
    expect(screen.queryByText(/unsynced/)).toBeNull();
  });

  it('"Sign out anyway" signs out', async () => {
    onlineManager.setOnline(false);
    renderHarness();
    await queueChange();
    fireEvent.click(screen.getByText('Sign out'));
    fireEvent.click(screen.getByText('Sign out anyway'));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('counts failed changes too, with plural wording', async () => {
    onlineManager.setOnline(false);
    renderHarness();
    await queueChange();
    act(() => recordFailed({ key: ['offline', 'pantry', 'add'], vars: {}, message: 'x' }));

    fireEvent.click(screen.getByText('Sign out'));
    expect(
      screen.getByText('You have 2 unsynced changes. Signing out will discard them.')
    ).toBeTruthy();
  });
});
