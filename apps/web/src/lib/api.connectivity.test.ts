import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('./nativeTokenStore', () => ({ nativeTokenStore: {} }));

import { setConnectivityHooks, users, fetchHealth, NetworkError } from './api';

const mockFetch = vi.fn();
const onSuccess = vi.fn();
const onFailure = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  onSuccess.mockReset();
  onFailure.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  setConnectivityHooks({ onSuccess, onFailure });
});

afterEach(() => {
  setConnectivityHooks({});
  vi.unstubAllGlobals();
});

describe('request() connectivity hooks', () => {
  it('reports success on a 2xx response', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ users: [] }), { status: 200 }));
    await users.list();
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('reports failure (offline) when fetch throws a TypeError', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(users.list()).rejects.toBeInstanceOf(NetworkError);
    expect(onFailure).toHaveBeenCalledWith('offline');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('does not report anything for HTTP error statuses', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'nope' }), { status: 500 }));
    await expect(users.list()).rejects.toThrow();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('does not report non-network errors such as aborts', async () => {
    mockFetch.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    await expect(users.list()).rejects.toThrow('aborted');
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('fetchHealth passes cache through and does not touch the hooks', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));
    await fetchHealth({ cache: 'no-store' });
    expect(mockFetch.mock.calls[0][1].cache).toBe('no-store');
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
