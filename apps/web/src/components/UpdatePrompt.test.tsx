import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { UpdatePrompt, UPDATE_CHECK_INTERVAL_MS, RELOAD_FALLBACK_MS } from './UpdatePrompt';
import { DEPLOY_POLL_INTERVAL_MS } from '@/hooks/useDeployDetection';

type RegisterOptions = {
  onRegisteredSW?: (url: string, registration: ServiceWorkerRegistration | undefined) => void;
};

const mockUpdateServiceWorker = vi.fn();
const mockUseRegisterSW = vi.fn();
const mockIsNativePlatform = vi.fn();
const mockFetch = vi.fn();
const mockReload = vi.fn();
let instanceId = 'inst-1';
let needRefresh = false;
let capturedOptions: RegisterOptions | undefined;

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options?: RegisterOptions) => mockUseRegisterSW(options),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mockIsNativePlatform() },
}));

function setServiceWorkerSupport(supported: boolean) {
  if (supported) {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: new EventTarget(),
    });
  } else {
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  }
}

/** Flush pending promises (fetch + json) under fake timers. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function makeRegistration() {
  const update = vi.fn().mockResolvedValue(undefined);
  return { update, registration: { update } as unknown as ServiceWorkerRegistration };
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  needRefresh = false;
  capturedOptions = undefined;
  instanceId = 'inst-1';
  setServiceWorkerSupport(true);
  mockIsNativePlatform.mockReturnValue(false);
  mockFetch.mockImplementation(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ instanceId }) })
  );
  vi.stubGlobal('fetch', mockFetch);
  vi.stubGlobal('location', { ...window.location, reload: mockReload });
  mockUseRegisterSW.mockImplementation((options?: RegisterOptions) => {
    capturedOptions = options;
    return {
      needRefresh: [needRefresh, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: mockUpdateServiceWorker,
    };
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  setServiceWorkerSupport(false);
  setVisibility('visible');
});

describe('UpdatePrompt', () => {
  it('shows nothing when no update is waiting', () => {
    const { container } = render(<UpdatePrompt />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the banner when an update is waiting', () => {
    needRefresh = true;
    render(<UpdatePrompt />);
    expect(screen.getByRole('status')).toHaveTextContent('A new version is available');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('Reload activates the waiting service worker', () => {
    needRefresh = true;
    render(<UpdatePrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(mockUpdateServiceWorker).toHaveBeenCalledWith(true);
  });

  describe('Reload click (service worker path)', () => {
    function clickReload() {
      needRefresh = true;
      const view = render(<UpdatePrompt />);
      fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
      return view;
    }

    it('disables the button and shows Reloading...', () => {
      clickReload();
      const button = screen.getByRole('button', { name: 'Reloading…' });
      expect(button).toBeDisabled();
      expect(mockUpdateServiceWorker).toHaveBeenCalledWith(true);
    });

    it('ignores repeat clicks', () => {
      clickReload();
      fireEvent.click(screen.getByRole('button', { name: 'Reloading…' }));
      expect(mockUpdateServiceWorker).toHaveBeenCalledTimes(1);
    });

    it('reloads exactly once on controllerchange', () => {
      clickReload();
      act(() => {
        navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
        navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
      });
      expect(mockReload).toHaveBeenCalledTimes(1);
    });

    it('reloads after the fallback delay when no controllerchange fires', () => {
      clickReload();
      act(() => {
        vi.advanceTimersByTime(RELOAD_FALLBACK_MS - 1);
      });
      expect(mockReload).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(mockReload).toHaveBeenCalledTimes(1);
    });

    it('does not reload twice when the timer fires after controllerchange', () => {
      clickReload();
      act(() => {
        navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
        vi.advanceTimersByTime(RELOAD_FALLBACK_MS * 2);
      });
      expect(mockReload).toHaveBeenCalledTimes(1);
    });

    it('clears the timer and listener on unmount', () => {
      const { unmount } = clickReload();
      unmount();
      act(() => {
        navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
        vi.advanceTimersByTime(RELOAD_FALLBACK_MS * 2);
      });
      expect(mockReload).not.toHaveBeenCalled();
    });
  });

  it('dismiss hides the banner', () => {
    needRefresh = true;
    render(<UpdatePrompt />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss update notice' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('checks for updates hourly', () => {
    const { registration, update } = makeRegistration();
    render(<UpdatePrompt />);
    act(() => capturedOptions?.onRegisteredSW?.('/sw.js', registration));

    expect(update).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    });
    expect(update).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
    });
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('checks for updates when the tab becomes visible, not when hidden', () => {
    const { registration, update } = makeRegistration();
    render(<UpdatePrompt />);
    act(() => capturedOptions?.onRegisteredSW?.('/sw.js', registration));

    act(() => setVisibility('hidden'));
    expect(update).not.toHaveBeenCalled();
    act(() => setVisibility('visible'));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('swallows update() rejections (e.g. offline)', async () => {
    const { registration, update } = makeRegistration();
    update.mockRejectedValue(new Error('offline'));
    render(<UpdatePrompt />);
    act(() => capturedOptions?.onRegisteredSW?.('/sw.js', registration));
    await act(async () => {
      setVisibility('visible');
    });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('ignores registration when the service worker is unavailable', () => {
    render(<UpdatePrompt />);
    expect(() => act(() => capturedOptions?.onRegisteredSW?.('/sw.js', undefined))).not.toThrow();
  });

  it('removes the interval and listener on unmount', () => {
    const { registration, update } = makeRegistration();
    const { unmount } = render(<UpdatePrompt />);
    act(() => capturedOptions?.onRegisteredSW?.('/sw.js', registration));
    unmount();

    act(() => {
      vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS * 3);
      setVisibility('visible');
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('does not start checks if registration resolves after unmount', () => {
    const { registration, update } = makeRegistration();
    const { unmount } = render(<UpdatePrompt />);
    unmount();
    act(() => capturedOptions?.onRegisteredSW?.('/sw.js', registration));
    act(() => {
      vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
      setVisibility('visible');
    });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('UpdatePrompt deploy detection', () => {
  async function renderRegistered() {
    const { registration, update } = makeRegistration();
    render(<UpdatePrompt />);
    act(() => capturedOptions?.onRegisteredSW?.('/sw.js', registration));
    await flush(); // baseline health check
    return update;
  }

  async function deployAndPoll(newId: string) {
    instanceId = newId;
    await act(async () => {
      vi.advanceTimersByTime(DEPLOY_POLL_INTERVAL_MS);
    });
    await flush();
  }

  it('does nothing when instanceId is unchanged', async () => {
    const update = await renderRegistered();
    await deployAndPoll('inst-1');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(update).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('checks the service worker (no reload, no toast) when instanceId changes', async () => {
    const update = await renderRegistered();
    await deployAndPoll('inst-2');
    expect(update).toHaveBeenCalledTimes(1);
    expect(mockReload).not.toHaveBeenCalled();
    // banner only appears once the SW reports needRefresh
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('detects a second deploy after the first', async () => {
    const update = await renderRegistered();
    await deployAndPoll('inst-2');
    await deployAndPoll('inst-2');
    expect(update).toHaveBeenCalledTimes(1);
    await deployAndPoll('inst-3');
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('stays silent on network errors and keeps polling', async () => {
    const update = await renderRegistered();
    mockFetch.mockRejectedValueOnce(new Error('offline'));
    await deployAndPoll('inst-1');
    await deployAndPoll('inst-2');
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('pauses polling while hidden and checks immediately when visible', async () => {
    await renderRegistered();
    act(() => setVisibility('hidden'));
    mockFetch.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(DEPLOY_POLL_INTERVAL_MS * 5);
    });
    expect(mockFetch).not.toHaveBeenCalled();

    act(() => setVisibility('visible'));
    await flush();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('stops polling on unmount', async () => {
    const { registration } = makeRegistration();
    const { unmount } = render(<UpdatePrompt />);
    act(() => capturedOptions?.onRegisteredSW?.('/sw.js', registration));
    await flush();
    unmount();
    mockFetch.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(DEPLOY_POLL_INTERVAL_MS * 3);
      setVisibility('visible');
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  describe('without a service worker', () => {
    beforeEach(() => setServiceWorkerSupport(false));

    it('shows a reload banner on deploy and reloads the page', async () => {
      render(<UpdatePrompt />);
      await flush();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      await deployAndPoll('inst-2');
      expect(screen.getByRole('status')).toHaveTextContent('A new version is available');
      fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
      expect(mockReload).toHaveBeenCalledTimes(1);
      expect(mockUpdateServiceWorker).not.toHaveBeenCalled();
    });
  });

  describe('on Capacitor native', () => {
    beforeEach(() => {
      mockIsNativePlatform.mockReturnValue(true);
      setServiceWorkerSupport(false);
    });

    it('shows nothing and does not poll', async () => {
      const { container } = render(<UpdatePrompt />);
      await flush();
      await deployAndPoll('inst-2');
      expect(mockFetch).not.toHaveBeenCalled();
      expect(container.firstChild).toBeNull();
    });
  });
});
