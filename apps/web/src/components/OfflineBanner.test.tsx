import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { OfflineBanner } from './OfflineBanner';

const mocks = vi.hoisted(() => ({
  online: vi.fn(),
  pending: vi.fn(),
  failed: vi.fn(),
  retry: vi.fn(),
}));

vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: mocks.online }));
vi.mock('@/lib/syncStatus', () => ({
  usePendingSyncCount: mocks.pending,
  useFailedSyncCount: mocks.failed,
  retryFailed: mocks.retry,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function setup(online: boolean, pending = 0, failed = 0) {
  mocks.online.mockReturnValue(online);
  mocks.pending.mockReturnValue(pending);
  mocks.failed.mockReturnValue(failed);
  return render(<OfflineBanner />);
}

describe('OfflineBanner', () => {
  it('keeps an empty polite live region when online with nothing pending', () => {
    setup(true);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');
  });

  it('shows the offline state', () => {
    setup(false, 3);
    expect(screen.getByRole('status').textContent).toMatch(
      /offline.*sync when you.re back online/i
    );
  });

  it('shows syncing N changes when online with pending', () => {
    setup(true, 2);
    expect(screen.getByRole('status').textContent).toContain('Syncing 2 changes');
  });

  it('uses the singular for one change', () => {
    setup(true, 1);
    expect(screen.getByRole('status').textContent).toContain('Syncing 1 change…');
  });

  it('shows failed changes with a working Retry button', () => {
    setup(true, 0, 2);
    expect(screen.getByRole('status').textContent).toContain('2 changes failed');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.retry).toHaveBeenCalledOnce();
  });

  it('prefers failed over pending', () => {
    setup(true, 4, 1);
    expect(screen.getByRole('status').textContent).toContain('1 change failed');
  });
});
