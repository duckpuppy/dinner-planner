import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { UpdatePrompt, UPDATE_CHECK_INTERVAL_MS } from './UpdatePrompt';

type RegisterOptions = {
  onRegisteredSW?: (url: string, registration: ServiceWorkerRegistration | undefined) => void;
};

const mockUpdateServiceWorker = vi.fn();
const mockUseRegisterSW = vi.fn();
let needRefresh = false;
let capturedOptions: RegisterOptions | undefined;

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options?: RegisterOptions) => mockUseRegisterSW(options),
}));

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
  vi.clearAllMocks();
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
