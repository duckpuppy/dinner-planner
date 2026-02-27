import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    onlineManager: {
      setOnline: vi.fn(),
    },
  };
});

const { mockUseOnlineStatus } = vi.hoisted(() => ({
  mockUseOnlineStatus: vi.fn(),
}));

vi.mock('./useOnlineStatus', () => ({
  useOnlineStatus: mockUseOnlineStatus,
}));

import { useOfflineSync } from './useOfflineSync';
import { onlineManager } from '@tanstack/react-query';
import { toast } from 'sonner';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useOfflineSync', () => {
  it('returns isOnline true when online', () => {
    mockUseOnlineStatus.mockReturnValue(true);
    const { result } = renderHook(() => useOfflineSync(), { wrapper: createWrapper() });
    expect(result.current.isOnline).toBe(true);
  });

  it('returns isOnline false when offline', () => {
    mockUseOnlineStatus.mockReturnValue(false);
    const { result } = renderHook(() => useOfflineSync(), { wrapper: createWrapper() });
    expect(result.current.isOnline).toBe(false);
  });

  it('sets onlineManager online when isOnline is true', () => {
    mockUseOnlineStatus.mockReturnValue(true);
    renderHook(() => useOfflineSync(), { wrapper: createWrapper() });
    expect(onlineManager.setOnline).toHaveBeenCalledWith(true);
  });

  it('sets onlineManager offline when isOnline is false', () => {
    mockUseOnlineStatus.mockReturnValue(false);
    renderHook(() => useOfflineSync(), { wrapper: createWrapper() });
    expect(onlineManager.setOnline).toHaveBeenCalledWith(false);
  });

  it('shows toast when coming back online after being offline', () => {
    mockUseOnlineStatus.mockReturnValue(false);
    const { rerender } = renderHook(() => useOfflineSync(), { wrapper: createWrapper() });

    // Go offline first
    expect(toast.success).not.toHaveBeenCalled();

    // Come back online
    mockUseOnlineStatus.mockReturnValue(true);
    rerender();

    expect(toast.success).toHaveBeenCalledWith('Back online — syncing changes');
  });

  it('does NOT show toast when starting online (wasOffline.current = false)', () => {
    mockUseOnlineStatus.mockReturnValue(true);
    renderHook(() => useOfflineSync(), { wrapper: createWrapper() });
    expect(toast.success).not.toHaveBeenCalled();
  });
});
