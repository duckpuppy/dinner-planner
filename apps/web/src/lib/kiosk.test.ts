import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  KIOSK_KEY_STORAGE,
  KioskAuthError,
  fetchKioskWeek,
  readStoredKioskKey,
  resolveKioskKey,
  clearStoredKioskKey,
  storeKioskKey,
} from './kiosk';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/kiosk');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resolveKioskKey', () => {
  it('persists ?key= and strips it from the URL', () => {
    window.history.replaceState(null, '', '/kiosk?key=dpk_abc&x=1#h');
    expect(resolveKioskKey()).toBe('dpk_abc');
    expect(localStorage.getItem(KIOSK_KEY_STORAGE)).toBe('dpk_abc');
    expect(window.location.search).toBe('?x=1');
    expect(window.location.hash).toBe('#h');
    // Second call (StrictMode double init) still resolves via storage.
    expect(resolveKioskKey()).toBe('dpk_abc');
  });

  it('falls back to the stored key', () => {
    storeKioskKey('dpk_saved');
    expect(resolveKioskKey()).toBe('dpk_saved');
  });

  it('returns null when nothing is available', () => {
    expect(resolveKioskKey()).toBeNull();
  });

  it('tolerates unavailable storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStoredKioskKey()).toBeNull();
    window.history.replaceState(null, '', '/kiosk?key=dpk_x');
    expect(resolveKioskKey()).toBe('dpk_x');
    expect(() => clearStoredKioskKey()).not.toThrow();
  });
});

describe('fetchKioskWeek', () => {
  it('sends the dpk key as a bearer token without credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ weekStartDate: '2026-06-07', today: '2026-06-10', entries: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const week = await fetchKioskWeek('dpk_k', '2026-06-10');
    expect(week.today).toBe('2026-06-10');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/kiosk/week?date=2026-06-10');
    expect(init.headers.Authorization).toBe('Bearer dpk_k');
    expect(init.credentials).toBe('omit');
  });

  it('throws KioskAuthError on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(fetchKioskWeek('dpk_k', '2026-06-10')).rejects.toBeInstanceOf(KioskAuthError);
  });

  it('throws a generic error on other failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchKioskWeek('dpk_k', '2026-06-10')).rejects.toThrow('500');
  });
});
