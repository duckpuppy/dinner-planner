import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onlineManager } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  fetchHealth: vi.fn(),
  setConnectivityHooks: vi.fn(),
  isNative: vi.fn(() => false),
  addListener: vi.fn(),
  getStatus: vi.fn(),
  remove: vi.fn(() => Promise.resolve()),
}));

vi.mock('./api', () => ({
  fetchHealth: mocks.fetchHealth,
  setConnectivityHooks: mocks.setConnectivityHooks,
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: mocks.isNative } }));
vi.mock('@capacitor/network', () => ({
  Network: { addListener: mocks.addListener, getStatus: mocks.getStatus },
}));

import {
  BACKOFF_MS,
  getConnectivityState,
  startConnectivity,
  stopConnectivity,
  subscribe,
  reportFailure,
  reportSuccess,
} from './connectivity';

const ok = () => Promise.resolve({ ok: true } as Response);
const fail = () => Promise.reject(new Error('offline'));
const flush = () => vi.advanceTimersByTimeAsync(0);

let statusListener: ((s: { connected: boolean }) => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  mocks.fetchHealth.mockReset();
  mocks.isNative.mockReturnValue(false);
  statusListener = undefined;
  mocks.addListener.mockImplementation((_evt: string, cb: typeof statusListener) => {
    statusListener = cb;
    return Promise.resolve({ remove: mocks.remove });
  });
  mocks.getStatus.mockResolvedValue({ connected: true });
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

afterEach(() => {
  stopConnectivity();
  vi.useRealTimers();
  vi.restoreAllMocks();
  mocks.remove.mockClear();
  mocks.addListener.mockReset();
});

describe('connectivity (web)', () => {
  it('starts online without probing', () => {
    startConnectivity();
    expect(onlineManager.isOnline()).toBe(true);
    expect(mocks.fetchHealth).not.toHaveBeenCalled();
    expect(mocks.setConnectivityHooks).toHaveBeenCalled();
  });

  it('probes with cache: no-store on a reported network failure and goes offline on failure', async () => {
    mocks.fetchHealth.mockImplementation(fail);
    startConnectivity();
    reportFailure();
    await flush();
    expect(mocks.fetchHealth).toHaveBeenCalledWith({ cache: 'no-store' });
    expect(getConnectivityState().online).toBe(false);
    expect(onlineManager.isOnline()).toBe(false);
  });

  it('stays online when the probe after a failure report succeeds', async () => {
    mocks.fetchHealth.mockImplementation(ok);
    startConnectivity();
    reportFailure();
    await flush();
    expect(getConnectivityState().online).toBe(true);
  });

  it('treats a non-ok health response as offline', async () => {
    mocks.fetchHealth.mockResolvedValue({ ok: false } as Response);
    startConnectivity();
    reportFailure();
    await flush();
    expect(getConnectivityState().online).toBe(false);
  });

  it('backs off 5s, 10s, 20s, 40s, 60s, caps at 60s, and resets on success', async () => {
    mocks.fetchHealth.mockImplementation(fail);
    startConnectivity();
    reportFailure();
    await flush();
    expect(mocks.fetchHealth).toHaveBeenCalledTimes(1);

    let calls = 1;
    for (const delay of [...BACKOFF_MS, 60_000, 60_000]) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(mocks.fetchHealth).toHaveBeenCalledTimes(calls);
      await vi.advanceTimersByTimeAsync(1);
      calls += 1;
      expect(mocks.fetchHealth).toHaveBeenCalledTimes(calls);
    }

    // Recover, go offline again: schedule restarts at 5s.
    mocks.fetchHealth.mockImplementation(ok);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getConnectivityState().online).toBe(true);
    const before = mocks.fetchHealth.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mocks.fetchHealth.mock.calls.length).toBe(before); // no more retries when online

    mocks.fetchHealth.mockImplementation(fail);
    reportFailure();
    await flush();
    const n = mocks.fetchHealth.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.fetchHealth.mock.calls.length).toBe(n + 1);
  });

  it('goes online when a retry probe succeeds', async () => {
    mocks.fetchHealth.mockImplementationOnce(fail).mockImplementation(ok);
    startConnectivity();
    reportFailure();
    await flush();
    expect(getConnectivityState().online).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(getConnectivityState().online).toBe(true);
  });

  it('reportSuccess marks online without a probe and stops retries', async () => {
    mocks.fetchHealth.mockImplementation(fail);
    startConnectivity();
    reportFailure();
    await flush();
    expect(getConnectivityState().online).toBe(false);
    mocks.fetchHealth.mockClear();

    reportSuccess();
    expect(getConnectivityState().online).toBe(true);
    expect(onlineManager.isOnline()).toBe(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mocks.fetchHealth).not.toHaveBeenCalled();
  });

  it('dedupes concurrent probes', async () => {
    let resolve!: (r: Response) => void;
    mocks.fetchHealth.mockImplementation(() => new Promise<Response>((r) => (resolve = r)));
    startConnectivity();
    reportFailure();
    reportFailure();
    window.dispatchEvent(new Event('online'));
    expect(mocks.fetchHealth).toHaveBeenCalledTimes(1);
    expect(getConnectivityState().probing).toBe(true);
    resolve({ ok: true } as Response);
    await flush();
    expect(getConnectivityState().probing).toBe(false);
  });

  it('does not re-probe on failure reports while already offline', async () => {
    mocks.fetchHealth.mockImplementation(fail);
    startConnectivity();
    reportFailure();
    await flush();
    reportFailure();
    await flush();
    expect(mocks.fetchHealth).toHaveBeenCalledTimes(1);
  });

  it('sets offline immediately on a window offline event, then keeps probing', async () => {
    mocks.fetchHealth.mockImplementation(ok);
    startConnectivity();
    window.dispatchEvent(new Event('offline'));
    expect(getConnectivityState().online).toBe(false);
    await flush();
    expect(mocks.fetchHealth).toHaveBeenCalledTimes(1);
    expect(getConnectivityState().online).toBe(true);
  });

  it('online event probes and stays offline if the probe fails (Wi-Fi without internet)', async () => {
    mocks.fetchHealth.mockImplementation(fail);
    startConnectivity();
    reportFailure();
    await flush();
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(mocks.fetchHealth).toHaveBeenCalledTimes(2);
    expect(getConnectivityState().online).toBe(false);
  });

  it('probes when the page becomes visible', async () => {
    mocks.fetchHealth.mockImplementation(ok);
    startConnectivity();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(mocks.fetchHealth).toHaveBeenCalledTimes(1);
  });

  it('does not probe when the page becomes hidden', async () => {
    startConnectivity();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(mocks.fetchHealth).not.toHaveBeenCalled();
  });

  it('starts offline when navigator.onLine is false', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mocks.fetchHealth.mockImplementation(fail);
    startConnectivity();
    expect(getConnectivityState().online).toBe(false);
    await flush();
  });

  it('notifies subscribers and stamps lastChangeAt', async () => {
    mocks.fetchHealth.mockImplementation(fail);
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    startConnectivity();
    const t0 = getConnectivityState().lastChangeAt;
    await vi.advanceTimersByTimeAsync(1_000);
    reportFailure();
    await flush();
    expect(listener).toHaveBeenCalled();
    expect(getConnectivityState().lastChangeAt).toBeGreaterThan(t0);
    unsubscribe();
    listener.mockClear();
    reportSuccess();
    expect(listener).not.toHaveBeenCalled();
  });

  it('stopConnectivity removes listeners and cancels retries', async () => {
    mocks.fetchHealth.mockImplementation(fail);
    startConnectivity();
    reportFailure();
    await flush();
    stopConnectivity();
    mocks.fetchHealth.mockClear();
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(mocks.fetchHealth).not.toHaveBeenCalled();
    expect(getConnectivityState().online).toBe(true);
  });

  it('startConnectivity is idempotent', () => {
    startConnectivity();
    startConnectivity();
    expect(mocks.setConnectivityHooks).toHaveBeenCalledTimes(1);
  });

  it('wires hooks that map to reportSuccess/reportFailure', async () => {
    mocks.fetchHealth.mockImplementation(fail);
    startConnectivity();
    const hooks = mocks.setConnectivityHooks.mock.calls[0][0];
    hooks.onFailure('offline');
    await flush();
    expect(getConnectivityState().online).toBe(false);
    hooks.onSuccess();
    expect(getConnectivityState().online).toBe(true);
  });
});

describe('connectivity (native)', () => {
  beforeEach(() => {
    mocks.isNative.mockReturnValue(true);
  });

  it('ignores window online/offline events and uses the Network plugin', async () => {
    mocks.fetchHealth.mockImplementation(ok);
    startConnectivity();
    await flush();
    mocks.fetchHealth.mockClear();
    window.dispatchEvent(new Event('offline'));
    await flush();
    expect(getConnectivityState().online).toBe(true);
    expect(mocks.fetchHealth).not.toHaveBeenCalled();
    expect(mocks.addListener).toHaveBeenCalledWith('networkStatusChange', expect.any(Function));
  });

  it('probes the initial getStatus result', async () => {
    mocks.fetchHealth.mockImplementation(ok);
    startConnectivity();
    await flush();
    expect(mocks.getStatus).toHaveBeenCalled();
    expect(mocks.fetchHealth).toHaveBeenCalledTimes(1);
  });

  it('sets offline immediately on connected:false', async () => {
    mocks.fetchHealth.mockImplementation(ok);
    startConnectivity();
    await flush();
    mocks.fetchHealth.mockImplementation(fail);
    statusListener!({ connected: false });
    expect(getConnectivityState().online).toBe(false);
    expect(onlineManager.isOnline()).toBe(false);
    await flush();
    expect(getConnectivityState().online).toBe(false);
  });

  it('connected:true goes online only if the probe succeeds', async () => {
    mocks.fetchHealth.mockImplementation(fail);
    startConnectivity();
    await flush();
    statusListener!({ connected: false });
    await flush();
    expect(getConnectivityState().online).toBe(false);

    // Wi-Fi with no internet: the plugin says connected but the probe fails.
    statusListener!({ connected: true });
    await flush();
    expect(getConnectivityState().online).toBe(false);

    mocks.fetchHealth.mockImplementation(ok);
    statusListener!({ connected: true });
    await flush();
    expect(getConnectivityState().online).toBe(true);
  });

  it('probes if getStatus rejects', async () => {
    mocks.getStatus.mockRejectedValue(new Error('nope'));
    mocks.fetchHealth.mockImplementation(ok);
    startConnectivity();
    await flush();
    expect(mocks.fetchHealth).toHaveBeenCalledTimes(1);
  });

  it('removes the plugin listener on stop', async () => {
    mocks.fetchHealth.mockImplementation(ok);
    startConnectivity();
    await flush();
    stopConnectivity();
    expect(mocks.remove).toHaveBeenCalled();
  });

  it('removes the plugin listener if stopped before addListener resolves', async () => {
    mocks.fetchHealth.mockImplementation(ok);
    startConnectivity();
    stopConnectivity();
    await flush();
    expect(mocks.remove).toHaveBeenCalled();
  });
});
