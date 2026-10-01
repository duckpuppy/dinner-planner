import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockIsNative, mockStore } = vi.hoisted(() => ({
  mockIsNative: vi.fn(() => false),
  mockStore: {
    get: vi.fn<() => Promise<string | null>>(),
    set: vi.fn<(t: string) => Promise<void>>(),
    clear: vi.fn<() => Promise<void>>(),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mockIsNative() },
}));
vi.mock('./nativeTokenStore', () => ({ nativeTokenStore: mockStore }));

import {
  ApiError,
  NetworkError,
  auth,
  fetchHealth,
  getAccessToken,
  photos,
  postSetup,
  setAccessToken,
  users,
} from './api';

const mockFetch = vi.fn();
const user = { id: '1', familyId: 'f', username: 'u', displayName: 'U', role: 'member' };

function json(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const neverResolves = (_url: unknown, init?: RequestInit) =>
  new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(new DOMException('aborted', 'AbortError'))
    );
  });

beforeEach(() => {
  mockFetch.mockReset();
  mockIsNative.mockReturnValue(false);
  mockStore.get.mockReset().mockResolvedValue(null);
  mockStore.set.mockReset().mockResolvedValue(undefined);
  mockStore.clear.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('fetch', mockFetch);
  setAccessToken('old');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('timeouts and network errors', () => {
  it('turns a fetch that never resolves into NetworkError(timeout) after 15s for GET', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(neverResolves);
    const result = users.list().catch((e) => e);

    await vi.advanceTimersByTimeAsync(14_999);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    const err = await result;
    expect(err).toBeInstanceOf(NetworkError);
    expect(err.kind).toBe('timeout');
  });

  it('uses a 20s timeout for non-GET requests', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(neverResolves);
    const result = users.create({ username: 'a' } as never).catch((e) => e);

    await vi.advanceTimersByTimeAsync(19_999);
    let settled = false;
    void result.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await result).kind).toBe('timeout');
  });

  it('uses a 120s timeout for FormData uploads', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(neverResolves);
    const result = photos.upload('p1', new File(['x'], 'a.png')).catch((e) => e);

    await vi.advanceTimersByTimeAsync(119_999);
    let settled = false;
    void result.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await result).kind).toBe('timeout');
  });

  it('times out health checks after 5s', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(neverResolves);
    const result = fetchHealth().catch((e) => e);
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await result).kind).toBe('timeout');
  });

  it('times out a refresh after 10s', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(neverResolves);
    const result = auth.refresh().catch((e) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await result).kind).toBe('timeout');
  });

  it('turns a fetch TypeError into NetworkError(offline)', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await users.list().catch((e) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect(err.kind).toBe('offline');
  });

  it('propagates NetworkError (not a 401) when the refresh itself fails on the network', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).endsWith('/auth/refresh')) throw new TypeError('Failed to fetch');
      return json(401, { error: 'expired' });
    });
    const err = await users.list().catch((e) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect(err).not.toBeInstanceOf(ApiError);
    expect(getAccessToken()).toBe('old');
  });

  it('still reports Session expired when the refresh is rejected', async () => {
    mockFetch.mockImplementation(async (url: string) =>
      String(url).endsWith('/auth/refresh') ? json(401, { error: 'no' }) : json(401, {})
    );
    await expect(users.list()).rejects.toMatchObject({ status: 401, message: 'Session expired' });
    expect(getAccessToken()).toBeNull();
  });
});

describe('requestFormData', () => {
  it('refreshes on 401 and retries once with the new token', async () => {
    const seen: string[] = [];
    mockFetch.mockImplementation(async (url: string, init: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) return json(200, { user, accessToken: 'new' });
      seen.push((init.headers as Record<string, string>).Authorization);
      return seen.length === 1
        ? json(401, { error: 'expired' })
        : json(200, { photo: { id: 'p' } });
    });

    const result = await photos.upload('prep1', new File(['x'], 'a.png'));

    expect(result).toEqual({ photo: { id: 'p' } });
    expect(seen).toEqual(['Bearer old', 'Bearer new']);
    const retry = mockFetch.mock.calls.at(-1)!;
    expect((retry[1].headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect(retry[1].body).toBeInstanceOf(FormData);
  });

  it('does not retry more than once', async () => {
    mockFetch.mockImplementation(async (url: string) =>
      String(url).endsWith('/auth/refresh')
        ? json(200, { user, accessToken: 'new' })
        : json(401, { error: 'still no' })
    );
    await expect(photos.upload('prep1', new File(['x'], 'a.png'))).rejects.toMatchObject({
      status: 401,
    });
    expect(
      mockFetch.mock.calls.filter((c) => !String(c[0]).endsWith('/auth/refresh'))
    ).toHaveLength(2);
  });
});

describe('native transport', () => {
  beforeEach(() => {
    mockIsNative.mockReturnValue(true);
    vi.stubEnv('VITE_API_ORIGIN', 'https://dinner.example.com');
  });

  it('sends the platform header, omits credentials and targets the API origin', async () => {
    mockFetch.mockResolvedValue(json(200, { users: [] }));
    await users.list();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://dinner.example.com/api/users');
    expect(init.credentials).toBe('omit');
    expect(init.headers['X-Client-Platform']).toBe('native');
  });

  it('stores the refresh token from login and keeps the access token out of storage', async () => {
    mockFetch.mockResolvedValue(json(200, { user, accessToken: 'at', refreshToken: 'rt' }));
    const result = await auth.login('u', 'p');
    expect(mockStore.set).toHaveBeenCalledWith('rt');
    expect(result).toEqual({ user, accessToken: 'at' });
    expect(mockStore.set).not.toHaveBeenCalledWith('at');
  });

  it('sends the stored refresh token in the body on refresh', async () => {
    mockStore.get.mockResolvedValue('rt');
    mockFetch.mockResolvedValue(json(200, { user, accessToken: 'at2' }));
    await auth.refresh();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://dinner.example.com/api/auth/refresh');
    expect(JSON.parse(init.body)).toEqual({ refreshToken: 'rt' });
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.credentials).toBe('omit');
  });

  it('rejects with 401 without a network call when no token is stored', async () => {
    await expect(auth.refresh()).rejects.toMatchObject({ status: 401 });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('clears the stored token when the server rejects the refresh', async () => {
    mockStore.get.mockResolvedValue('rt');
    mockFetch.mockResolvedValue(json(401, { error: 'nope' }));
    await expect(auth.refresh()).rejects.toMatchObject({ status: 401 });
    expect(mockStore.clear).toHaveBeenCalled();
  });

  it('keeps the stored token on a network failure', async () => {
    mockStore.get.mockResolvedValue('rt');
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(auth.refresh()).rejects.toBeInstanceOf(NetworkError);
    expect(mockStore.clear).not.toHaveBeenCalled();
  });

  it('silent refresh after a 401 uses the body token', async () => {
    mockStore.get.mockResolvedValue('rt');
    mockFetch.mockImplementation(async (url: string, init: RequestInit) => {
      if (String(url).endsWith('/auth/refresh')) return json(200, { user, accessToken: 'new' });
      return (init.headers as Record<string, string>).Authorization === 'Bearer new'
        ? json(200, { users: [] })
        : json(401, {});
    });
    await expect(users.list()).resolves.toEqual({ users: [] });
    expect(getAccessToken()).toBe('new');
  });

  it('logout sends the refresh token and clears the store, even if the request fails', async () => {
    mockStore.get.mockResolvedValue('rt');
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(auth.logout()).rejects.toBeInstanceOf(NetworkError);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ refreshToken: 'rt' });
    expect(mockStore.clear).toHaveBeenCalled();
  });

  it('applies the origin and header to health and setup', async () => {
    mockFetch.mockImplementation(async () => json(200, {}));
    await fetchHealth();
    await postSetup('a', 'b', 'c');
    expect(mockFetch.mock.calls[0][0]).toBe('https://dinner.example.com/health');
    expect(mockFetch.mock.calls[1][0]).toBe('https://dinner.example.com/api/setup');
    for (const [, init] of mockFetch.mock.calls) {
      expect(init.headers['X-Client-Platform']).toBe('native');
      expect(init.credentials).toBe('omit');
    }
  });
});

describe('web transport', () => {
  it('keeps the cookie flow: credentials included, no platform header, no body on refresh', async () => {
    mockFetch.mockResolvedValue(json(200, { user, accessToken: 'at' }));
    await auth.refresh();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/auth/refresh');
    expect(init.credentials).toBe('include');
    expect(init.headers['X-Client-Platform']).toBeUndefined();
    expect(init.body).toBeUndefined();
    expect(mockStore.get).not.toHaveBeenCalled();
  });

  it('does not touch the native store on login/logout', async () => {
    mockFetch.mockImplementation(async () =>
      json(200, { user, accessToken: 'at', refreshToken: 'x' })
    );
    await auth.login('u', 'p');
    await auth.logout();
    expect(mockStore.set).not.toHaveBeenCalled();
    expect(mockStore.clear).not.toHaveBeenCalled();
  });
});
