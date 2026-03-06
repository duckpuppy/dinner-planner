/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: { info: vi.fn() },
}));

import { useVersionCheck } from './useVersionCheck';
import { toast } from 'sonner';

function healthResponse(instanceId: string) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ status: 'ok', instanceId }),
  });
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useVersionCheck', () => {
  it('captures initial instanceId without showing toast', async () => {
    fetchSpy.mockReturnValue(healthResponse('abc123'));
    renderHook(() => useVersionCheck());
    await act(async () => {});
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('shows toast when instanceId changes', async () => {
    fetchSpy
      .mockReturnValueOnce(healthResponse('abc123'))
      .mockReturnValue(healthResponse('xyz789'));

    renderHook(() => useVersionCheck());
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(toast.info).toHaveBeenCalledOnce();
    expect(toast.info).toHaveBeenCalledWith(
      'Update available',
      expect.objectContaining({ duration: Infinity })
    );
  });

  it('shows toast only once even if instanceId keeps changing', async () => {
    fetchSpy
      .mockReturnValueOnce(healthResponse('v1'))
      .mockReturnValueOnce(healthResponse('v2'))
      .mockReturnValue(healthResponse('v3'));

    renderHook(() => useVersionCheck());
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(toast.info).toHaveBeenCalledOnce();
  });

  it('stops polling after showing toast', async () => {
    fetchSpy.mockReturnValueOnce(healthResponse('v1')).mockReturnValue(healthResponse('v2'));

    renderHook(() => useVersionCheck());
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    const callsAfterToast = fetchSpy.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchSpy.mock.calls.length).toBe(callsAfterToast);
  });

  it('handles fetch failures silently', async () => {
    fetchSpy.mockRejectedValue(new Error('Network error'));
    renderHook(() => useVersionCheck());
    await act(async () => {});
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('handles non-ok response silently', async () => {
    fetchSpy.mockResolvedValue({ ok: false } as any);
    renderHook(() => useVersionCheck());
    await act(async () => {});
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('clears timeout on unmount — no further fetches after unmount', async () => {
    fetchSpy.mockReturnValue(healthResponse('v1'));
    const { unmount } = renderHook(() => useVersionCheck());
    await act(async () => {});
    unmount();
    const callsBefore = fetchSpy.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchSpy.mock.calls.length).toBe(callsBefore);
  });
});
