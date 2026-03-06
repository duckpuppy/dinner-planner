import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: { info: vi.fn() },
}));

import { useVersionCheck } from './useVersionCheck';
import { toast } from 'sonner';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function healthResponse(bootId: string) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ status: 'ok', bootId }),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mockFetch.mockReset();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useVersionCheck', () => {
  it('captures initial bootId without showing toast', async () => {
    mockFetch.mockReturnValue(healthResponse('abc123'));
    renderHook(() => useVersionCheck());
    await act(async () => {});
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('shows toast when bootId changes', async () => {
    mockFetch
      .mockReturnValueOnce(healthResponse('abc123'))
      .mockReturnValue(healthResponse('xyz789'));

    renderHook(() => useVersionCheck());
    await act(async () => {});

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(toast.info).toHaveBeenCalledOnce();
    expect(toast.info).toHaveBeenCalledWith(
      'Update available',
      expect.objectContaining({ duration: Infinity })
    );
  });

  it('shows toast only once even if bootId keeps changing', async () => {
    mockFetch
      .mockReturnValueOnce(healthResponse('v1'))
      .mockReturnValueOnce(healthResponse('v2'))
      .mockReturnValue(healthResponse('v3'));

    renderHook(() => useVersionCheck());
    await act(async () => {});

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(toast.info).toHaveBeenCalledOnce();
  });

  it('stops polling after showing toast', async () => {
    mockFetch.mockReturnValueOnce(healthResponse('v1')).mockReturnValue(healthResponse('v2'));

    renderHook(() => useVersionCheck());
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    const callsAfterToast = mockFetch.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(mockFetch.mock.calls.length).toBe(callsAfterToast);
  });

  it('handles fetch failures silently', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));
    renderHook(() => useVersionCheck());
    await act(async () => {});
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('handles non-ok response silently', async () => {
    mockFetch.mockResolvedValue({ ok: false });
    renderHook(() => useVersionCheck());
    await act(async () => {});
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('clears interval on unmount', async () => {
    mockFetch.mockReturnValue(healthResponse('v1'));
    const { unmount } = renderHook(() => useVersionCheck());
    await act(async () => {});
    unmount();
    const callsBefore = mockFetch.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(mockFetch.mock.calls.length).toBe(callsBefore);
  });
});
