import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { usePWAInstall } from './usePWAInstall';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockMatchMedia(standalone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: query === '(display-mode: standalone)' ? standalone : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('usePWAInstall', () => {
  it('returns isInstalled=true when in standalone mode', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.isInstalled).toBe(true);
  });

  it('returns canInstall=false when in standalone mode', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.canInstall).toBe(false);
  });

  it('returns isInstalled=false when not in standalone mode initially', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.isInstalled).toBe(false);
  });

  it('returns canInstall=false when no install prompt available', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => usePWAInstall());
    expect(result.current.canInstall).toBe(false);
  });

  it('sets canInstall=true when beforeinstallprompt event fires', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => usePWAInstall());

    const mockPrompt = {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    };

    act(() => {
      const event = Object.assign(new Event('beforeinstallprompt'), mockPrompt);
      window.dispatchEvent(event);
    });

    expect(result.current.canInstall).toBe(true);
  });

  it('sets isInstalled=true when appinstalled event fires', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => usePWAInstall());

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(result.current.isInstalled).toBe(true);
  });

  it('sets canInstall=false after appinstalled event', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => usePWAInstall());

    // First trigger install prompt
    const mockPrompt = {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    };

    act(() => {
      const event = Object.assign(new Event('beforeinstallprompt'), mockPrompt);
      window.dispatchEvent(event);
    });

    expect(result.current.canInstall).toBe(true);

    // Then app gets installed
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(result.current.canInstall).toBe(false);
  });

  it('install() returns false when no installPrompt', async () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => usePWAInstall());
    const outcome = await result.current.install();
    expect(outcome).toBe(false);
  });

  it('install() calls prompt and returns true when accepted', async () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => usePWAInstall());

    const mockPromptEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    };

    act(() => {
      const event = Object.assign(new Event('beforeinstallprompt'), mockPromptEvent);
      window.dispatchEvent(event);
    });

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.install();
    });

    expect(mockPromptEvent.prompt).toHaveBeenCalled();
    expect(outcome).toBe(true);
  });

  it('install() returns false when dismissed', async () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => usePWAInstall());

    const mockPromptEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    };

    act(() => {
      const event = Object.assign(new Event('beforeinstallprompt'), mockPromptEvent);
      window.dispatchEvent(event);
    });

    let outcome: boolean | undefined;
    await act(async () => {
      outcome = await result.current.install();
    });

    expect(outcome).toBe(false);
  });

  it('removes event listeners on unmount', () => {
    mockMatchMedia(false);
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => usePWAInstall());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('beforeinstallprompt', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('appinstalled', expect.any(Function));
  });
});
