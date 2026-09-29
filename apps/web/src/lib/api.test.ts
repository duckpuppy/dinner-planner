import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  auth,
  ApiError,
  getAccessToken,
  onSessionExpired,
  onSessionRefreshed,
  setAccessToken,
  users,
} from './api';

const mockFetch = vi.fn();

const user = { id: '1', familyId: 'f2', username: 'u', displayName: 'U', role: 'member' };

function json(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function urlOf(call: unknown[]) {
  return String(call[0]);
}

const refreshCalls = () => mockFetch.mock.calls.filter((c) => urlOf(c).endsWith('/auth/refresh'));

// Routes: first hit on a data path returns 401, retry returns 200; refresh behaviour is per-test.
function route(refresh: () => Response | Promise<Response>) {
  const seen = new Set<string>();
  mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/auth/refresh')) return refresh();
    const key = `${init?.method ?? 'GET'} ${url} ${(init?.headers as Record<string, string>)?.Authorization ?? ''}`;
    if (
      seen.has(key) ||
      (init?.headers as Record<string, string>)?.Authorization === 'Bearer new'
    ) {
      return json(200, { users: [] });
    }
    seen.add(key);
    return json(401, { error: 'expired' });
  });
}

let cleanups: Array<() => void> = [];

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  setAccessToken('old');
  cleanups = [];
});

afterEach(() => {
  cleanups.forEach((c) => c());
  vi.unstubAllGlobals();
});

describe('silent refresh session events', () => {
  it('notifies refreshed listeners with the new user, then retries with the new token', async () => {
    route(() => json(200, { user, accessToken: 'new' }));
    const listener = vi.fn();
    cleanups.push(onSessionRefreshed(listener));

    await expect(users.list()).resolves.toEqual({ users: [] });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(user);
    expect(getAccessToken()).toBe('new');
  });

  it('waits for async listeners before retrying the request', async () => {
    route(() => json(200, { user, accessToken: 'new' }));
    let done = false;
    cleanups.push(
      onSessionRefreshed(async () => {
        await new Promise((r) => setTimeout(r, 5));
        done = true;
      })
    );
    const retryFetch = mockFetch.getMockImplementation()!;
    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.headers as Record<string, string>)?.Authorization === 'Bearer new') {
        expect(done).toBe(true);
      }
      return retryFetch(input, init);
    });
    await users.list();
  });

  it('fires expired listeners on a rejected refresh and throws 401', async () => {
    route(() => json(401, { error: 'no' }));
    const expired = vi.fn();
    const refreshed = vi.fn();
    cleanups.push(onSessionExpired(expired), onSessionRefreshed(refreshed));

    await expect(users.list()).rejects.toMatchObject({ status: 401 });
    await expect(users.list()).rejects.toBeInstanceOf(ApiError);

    expect(expired).toHaveBeenCalled();
    expect(refreshed).not.toHaveBeenCalled();
    expect(getAccessToken()).toBeNull();
  });

  it('does not fire expired listeners when the refresh fails on the network', async () => {
    route(() => {
      throw new TypeError('Failed to fetch');
    });
    const expired = vi.fn();
    cleanups.push(onSessionExpired(expired));

    await expect(users.list()).rejects.toMatchObject({ status: 401 });

    expect(expired).not.toHaveBeenCalled();
  });

  it('shares one /auth/refresh across concurrent 401s', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    route(async () => {
      await gate;
      return json(200, { user, accessToken: 'new' });
    });
    const listener = vi.fn();
    cleanups.push(onSessionRefreshed(listener));

    const all = Promise.all([users.list(), users.get('a'), users.get('b')]);
    await vi.waitFor(() => expect(refreshCalls()).toHaveLength(1));
    release();
    await all;

    expect(refreshCalls()).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('allows a new refresh after the previous one settled', async () => {
    route(() => json(200, { user, accessToken: 'new' }));
    await users.list();
    setAccessToken('old');
    route(() => json(200, { user, accessToken: 'new' }));
    await users.list();
    expect(refreshCalls()).toHaveLength(2);
  });

  it('stops notifying after unsubscribe', async () => {
    route(() => json(200, { user, accessToken: 'new' }));
    const listener = vi.fn();
    const unsubscribe = onSessionRefreshed(listener);
    unsubscribe();

    await users.list();

    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps going when a listener throws', async () => {
    route(() => json(200, { user, accessToken: 'new' }));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = vi.fn();
    cleanups.push(
      onSessionRefreshed(() => {
        throw new Error('boom');
      }),
      onSessionRefreshed(good)
    );

    await expect(users.list()).resolves.toEqual({ users: [] });

    expect(good).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('does not run refresh handling for /auth/ paths', async () => {
    mockFetch.mockResolvedValue(json(401, { error: 'bad' }));
    const expired = vi.fn();
    cleanups.push(onSessionExpired(expired));

    await expect(auth.login('a', 'b')).rejects.toMatchObject({ status: 401 });

    expect(expired).not.toHaveBeenCalled();
    expect(refreshCalls()).toHaveLength(0);
  });
});
