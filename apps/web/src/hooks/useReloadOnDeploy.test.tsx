import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import {
  KIOSK_DEPLOY_CHECK_MS,
  KIOSK_RELOAD_GUARD_MS,
  KIOSK_RELOAD_STORAGE,
  useReloadOnDeploy,
} from './useKioskDisplay';

const { mockHealth } = vi.hoisted(() => ({ mockHealth: vi.fn() }));
vi.mock('@/lib/api', () => ({ fetchHealth: mockHealth }));

const health = (body: object) => ({ ok: true, json: async () => body });
const reload = vi.fn();

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  sessionStorage.clear();
  reload.mockClear();
  mockHealth.mockReset();
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload },
    configurable: true,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useReloadOnDeploy', () => {
  it('reloads when the version changes from the first successful check', async () => {
    mockHealth.mockResolvedValue(health({ version: '1.0.0', instanceId: 'a' }));
    renderHook(() => useReloadOnDeploy());
    await advance(0);
    mockHealth.mockResolvedValue(health({ version: '1.1.0', instanceId: 'b' }));
    await advance(KIOSK_DEPLOY_CHECK_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('falls back to instanceId when there is no version', async () => {
    mockHealth.mockResolvedValue(health({ instanceId: 'a' }));
    renderHook(() => useReloadOnDeploy());
    await advance(0);
    mockHealth.mockResolvedValue(health({ instanceId: 'b' }));
    await advance(KIOSK_DEPLOY_CHECK_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the version is unchanged', async () => {
    mockHealth.mockResolvedValue(health({ version: '1.0.0' }));
    renderHook(() => useReloadOnDeploy());
    await advance(0);
    await advance(KIOSK_DEPLOY_CHECK_MS * 3);
    expect(mockHealth.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(reload).not.toHaveBeenCalled();
  });

  it('also checks when the page becomes visible', async () => {
    mockHealth.mockResolvedValue(health({ version: '1.0.0' }));
    renderHook(() => useReloadOnDeploy());
    await advance(0);
    mockHealth.mockResolvedValue(health({ version: '2.0.0' }));
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await advance(0);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('holds the loop guard: no second reload within 10 minutes', async () => {
    sessionStorage.setItem(KIOSK_RELOAD_STORAGE, String(Date.now()));
    mockHealth.mockResolvedValue(health({ version: '1.0.0' }));
    renderHook(() => useReloadOnDeploy());
    await advance(0);
    mockHealth.mockResolvedValue(health({ version: '2.0.0' }));
    await advance(KIOSK_DEPLOY_CHECK_MS);
    expect(reload).not.toHaveBeenCalled();
    await advance(KIOSK_RELOAD_GUARD_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('ignores network errors and non-ok responses', async () => {
    mockHealth.mockResolvedValue(health({ version: '1.0.0' }));
    renderHook(() => useReloadOnDeploy());
    await advance(0);
    mockHealth.mockRejectedValue(new TypeError('offline'));
    await advance(KIOSK_DEPLOY_CHECK_MS);
    mockHealth.mockResolvedValue({ ok: false, json: async () => ({}) });
    await advance(KIOSK_DEPLOY_CHECK_MS);
    expect(reload).not.toHaveBeenCalled();
  });

  it('still reloads when sessionStorage is unavailable', async () => {
    mockHealth.mockResolvedValue(health({ version: '1.0.0' }));
    renderHook(() => useReloadOnDeploy());
    await advance(0);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    mockHealth.mockResolvedValue(health({ version: '2.0.0' }));
    await advance(KIOSK_DEPLOY_CHECK_MS);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
