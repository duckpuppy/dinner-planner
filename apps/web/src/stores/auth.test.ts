import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';

const {
  mockGetHealth,
  mockAuthRefresh,
  mockAuthLogin,
  mockAuthLogout,
  mockSetAccessToken,
  mockBindCacheOwner,
  mockClearCache,
  mockReadSnapshot,
  mockWriteSnapshot,
  mockClearSnapshot,
  mockDiscardQueue,
  mockWarmPrefetch,
  mockProbe,
  mockResume,
  mockInvalidate,
  sessionListeners,
} = vi.hoisted(() => ({
  mockReadSnapshot: vi.fn(),
  mockWriteSnapshot: vi.fn(),
  mockClearSnapshot: vi.fn(),
  mockDiscardQueue: vi.fn(),
  mockWarmPrefetch: vi.fn(),
  mockProbe: vi.fn(),
  mockResume: vi.fn(),
  mockInvalidate: vi.fn(),
  mockGetHealth: vi.fn(),
  mockAuthRefresh: vi.fn(),
  mockAuthLogin: vi.fn(),
  mockAuthLogout: vi.fn(),
  mockSetAccessToken: vi.fn(),
  mockBindCacheOwner: vi.fn(),
  mockClearCache: vi.fn(),
  sessionListeners: {
    refreshed: null as ((user: unknown) => Promise<void> | void) | null,
    expired: null as (() => Promise<void> | void) | null,
  },
}));

vi.mock('@/lib/queryPersistence', () => ({
  bindCacheOwner: mockBindCacheOwner,
  clearCache: mockClearCache,
}));

vi.mock('@/lib/sessionSnapshot', () => ({
  readSnapshot: mockReadSnapshot,
  writeSnapshot: mockWriteSnapshot,
  clearSnapshot: mockClearSnapshot,
  isSnapshotFresh: (s: { lastServerContactAt: number }) =>
    Date.now() - s.lastServerContactAt <= 7 * 24 * 60 * 60 * 1000,
}));
vi.mock('@/lib/mutationQueueDiscard', () => ({ discardQueueAndNotify: mockDiscardQueue }));
vi.mock('@/lib/warmPrefetch', () => ({ warmPrefetch: mockWarmPrefetch }));
vi.mock('@/lib/connectivity', () => ({ probe: mockProbe }));
vi.mock('@/lib/queryClient', () => ({
  queryClient: { resumePausedMutations: mockResume, invalidateQueries: mockInvalidate },
}));

vi.mock('@/lib/api', () => ({
  NetworkError: class NetworkError extends Error {
    kind = 'offline';
  },
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  getHealth: mockGetHealth,
  setAccessToken: mockSetAccessToken,
  onSessionRefreshed: (l: (user: unknown) => Promise<void> | void) => {
    sessionListeners.refreshed = l;
    return () => {};
  },
  onSessionExpired: (l: () => Promise<void> | void) => {
    sessionListeners.expired = l;
    return () => {};
  },
  auth: {
    refresh: mockAuthRefresh,
    login: mockAuthLogin,
    logout: mockAuthLogout,
  },
}));

// Import AFTER mocking
import { useAuthStore, RECONNECT_RETRY_MS } from './auth';
import { ApiError, NetworkError } from '@/lib/api';
import { onlineManager } from '@tanstack/react-query';

function getState() {
  return useAuthStore.getState();
}

function resetStore() {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    setupRequired: false,
    sessionMode: 'online',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBindCacheOwner.mockResolvedValue(undefined);
  mockClearCache.mockResolvedValue(undefined);
  mockReadSnapshot.mockResolvedValue(null);
  mockWriteSnapshot.mockResolvedValue(undefined);
  mockClearSnapshot.mockResolvedValue(undefined);
  mockDiscardQueue.mockResolvedValue(0);
  mockProbe.mockResolvedValue(undefined);
  resetStore();
});

describe('authStore', () => {
  describe('initial state', () => {
    it('has setupRequired false by default', () => {
      expect(getState().setupRequired).toBe(false);
    });

    it('has isAuthenticated false by default', () => {
      expect(getState().isAuthenticated).toBe(false);
    });
  });

  describe('setupComplete action', () => {
    it('sets setupRequired to false', () => {
      useAuthStore.setState({ setupRequired: true });
      act(() => {
        getState().setupComplete();
      });
      expect(getState().setupRequired).toBe(false);
    });
  });

  describe('checkAuth', () => {
    it('sets setupRequired true and stops when health returns setupRequired true', async () => {
      mockGetHealth.mockResolvedValue({ status: 'ok', setupRequired: true });
      await act(async () => {
        await getState().checkAuth();
      });
      expect(getState().setupRequired).toBe(true);
      expect(getState().isAuthenticated).toBe(false);
      expect(getState().isLoading).toBe(false);
      expect(mockAuthRefresh).not.toHaveBeenCalled();
    });

    it('does not call auth.refresh when setup is required', async () => {
      mockGetHealth.mockResolvedValue({ status: 'ok', setupRequired: true });
      await act(async () => {
        await getState().checkAuth();
      });
      expect(mockAuthRefresh).not.toHaveBeenCalled();
    });

    it('proceeds to auth refresh when health returns setupRequired false', async () => {
      mockGetHealth.mockResolvedValue({ status: 'ok', setupRequired: false });
      const fakeUser = {
        id: '1',
        username: 'admin',
        displayName: 'Admin',
        role: 'admin' as const,
        theme: 'light' as const,
        homeView: 'today' as const,
        dietaryPreferences: [],
        familyId: 'f1',
      };
      mockAuthRefresh.mockResolvedValue({ user: fakeUser, accessToken: 'token123' });
      await act(async () => {
        await getState().checkAuth();
      });
      expect(getState().isAuthenticated).toBe(true);
      expect(getState().user).toEqual(fakeUser);
      expect(getState().setupRequired).toBe(false);
      expect(mockSetAccessToken).toHaveBeenCalledWith('token123');
      expect(mockBindCacheOwner).toHaveBeenCalledWith({ userId: '1', familyId: 'f1' });
    });

    it('clears both caches when the session is rejected', async () => {
      mockGetHealth.mockResolvedValue({ status: 'ok', setupRequired: false });
      mockAuthRefresh.mockRejectedValue(new ApiError(401, 'Unauthorized'));
      await act(async () => {
        await getState().checkAuth();
      });
      expect(mockClearCache).toHaveBeenCalledWith({ keepPersisted: false });
    });

    it('keeps the persisted cache on a network failure but still clears memory', async () => {
      mockGetHealth.mockResolvedValue({ status: 'ok', setupRequired: false });
      mockAuthRefresh.mockRejectedValue(new TypeError('Failed to fetch'));
      await act(async () => {
        await getState().checkAuth();
      });
      expect(mockClearCache).toHaveBeenCalledWith({ keepPersisted: true });
    });

    it('binds the cache before marking the user authenticated', async () => {
      mockGetHealth.mockResolvedValue({ status: 'ok', setupRequired: false });
      mockAuthRefresh.mockResolvedValue({ user: { id: '1', familyId: 'f1' }, accessToken: 't' });
      let authedWhenBinding: boolean | undefined;
      mockBindCacheOwner.mockImplementation(async () => {
        authedWhenBinding = getState().isAuthenticated;
      });
      await act(async () => {
        await getState().checkAuth();
      });
      expect(authedWhenBinding).toBe(false);
      expect(getState().isAuthenticated).toBe(true);
    });

    it('falls through to auth check when health check fails', async () => {
      mockGetHealth.mockRejectedValue(new Error('Network error'));
      const fakeUser = {
        id: '1',
        username: 'admin',
        displayName: 'Admin',
        role: 'admin' as const,
        theme: 'light' as const,
        homeView: 'today' as const,
        dietaryPreferences: [],
        familyId: 'f1',
      };
      mockAuthRefresh.mockResolvedValue({ user: fakeUser, accessToken: 'token123' });
      await act(async () => {
        await getState().checkAuth();
      });
      expect(getState().isAuthenticated).toBe(true);
      expect(mockAuthRefresh).toHaveBeenCalled();
    });

    it('sets isAuthenticated false when auth refresh fails', async () => {
      mockGetHealth.mockResolvedValue({ status: 'ok', setupRequired: false });
      mockAuthRefresh.mockRejectedValue(new Error('Unauthorized'));
      await act(async () => {
        await getState().checkAuth();
      });
      expect(getState().isAuthenticated).toBe(false);
      expect(getState().isLoading).toBe(false);
      expect(mockSetAccessToken).toHaveBeenCalledWith(null);
    });
  });

  describe('login', () => {
    it('sets user and isAuthenticated on successful login', async () => {
      const fakeUser = {
        id: 'u1',
        username: 'alice',
        displayName: 'Alice',
        role: 'user' as const,
        theme: 'light' as const,
        homeView: 'today' as const,
        dietaryPreferences: [],
        familyId: 'f1',
      };
      mockAuthLogin.mockResolvedValue({ user: fakeUser, accessToken: 'tok' });
      await act(async () => {
        await getState().login('alice', 'pass');
      });
      expect(getState().user).toEqual(fakeUser);
      expect(getState().isAuthenticated).toBe(true);
      expect(mockSetAccessToken).toHaveBeenCalledWith('tok');
      expect(mockBindCacheOwner).toHaveBeenCalledWith({ userId: 'u1', familyId: 'f1' });
    });

    it('propagates error when login fails', async () => {
      mockAuthLogin.mockRejectedValue(new Error('Invalid credentials'));
      await expect(
        act(async () => {
          await getState().login('bad', 'creds');
        })
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('logout', () => {
    it('clears user and isAuthenticated', async () => {
      useAuthStore.setState({
        user: {
          id: 'u1',
          username: 'alice',
          displayName: 'Alice',
          role: 'user',
          theme: 'light',
          homeView: 'today',
          dietaryPreferences: [],
        },
        isAuthenticated: true,
      });
      mockAuthLogout.mockResolvedValue(undefined);
      await act(async () => {
        await getState().logout();
      });
      expect(getState().user).toBeNull();
      expect(getState().isAuthenticated).toBe(false);
      expect(mockSetAccessToken).toHaveBeenCalledWith(null);
      expect(mockClearCache).toHaveBeenCalledWith();
    });

    it('still clears user even when logout API throws', async () => {
      useAuthStore.setState({ isAuthenticated: true });
      mockAuthLogout.mockRejectedValue(new Error('server error'));
      await act(async () => {
        await getState().logout();
      });
      expect(getState().isAuthenticated).toBe(false);
      expect(mockSetAccessToken).toHaveBeenCalledWith(null);
      expect(mockClearCache).toHaveBeenCalled();
    });
  });

  describe('updateUser', () => {
    it('merges updates into existing user', () => {
      useAuthStore.setState({
        user: {
          id: 'u1',
          username: 'alice',
          displayName: 'Alice',
          role: 'user',
          theme: 'light',
          homeView: 'today',
          dietaryPreferences: [],
        },
      });
      act(() => {
        getState().updateUser({ displayName: 'Alice Smith' });
      });
      expect(getState().user?.displayName).toBe('Alice Smith');
    });

    it('keeps null user if user is null', () => {
      useAuthStore.setState({ user: null });
      act(() => {
        getState().updateUser({ displayName: 'Alice' });
      });
      expect(getState().user).toBeNull();
    });
  });

  describe('session events from silent refresh', () => {
    const baseUser = {
      id: '1',
      username: 'admin',
      displayName: 'Admin',
      role: 'admin' as const,
      theme: 'light' as const,
      homeView: 'today' as const,
      dietaryPreferences: [],
      familyId: 'f1',
    };

    function signIn() {
      useAuthStore.setState({ user: baseUser as never, isAuthenticated: true });
    }

    it('rebinds the cache owner and updates the user when the family changed', async () => {
      signIn();
      const moved = { ...baseUser, familyId: 'f2' };
      await sessionListeners.refreshed!(moved);
      expect(mockBindCacheOwner).toHaveBeenCalledWith({ userId: '1', familyId: 'f2' });
      expect(getState().user).toEqual(moved);
    });

    it('rebinds the cache owner when the user id changed', async () => {
      signIn();
      await sessionListeners.refreshed!({ ...baseUser, id: '2' });
      expect(mockBindCacheOwner).toHaveBeenCalledWith({ userId: '2', familyId: 'f1' });
    });

    it('updates user fields without rebinding when the owner is unchanged', async () => {
      signIn();
      await sessionListeners.refreshed!({ ...baseUser, displayName: 'Renamed', role: 'member' });
      expect(mockBindCacheOwner).not.toHaveBeenCalled();
      expect(getState().user?.displayName).toBe('Renamed');
      expect(getState().user?.role).toBe('member');
    });

    it('ignores a refreshed event while logged out', async () => {
      await sessionListeners.refreshed!({ ...baseUser, familyId: 'f2' });
      expect(mockBindCacheOwner).not.toHaveBeenCalled();
      expect(getState().user).toBeNull();
    });

    it('does not resurrect the user if logout happens while rebinding', async () => {
      signIn();
      mockBindCacheOwner.mockImplementation(async () => {
        useAuthStore.setState({ user: null, isAuthenticated: false });
      });
      await sessionListeners.refreshed!({ ...baseUser, familyId: 'f2' });
      expect(getState().user).toBeNull();
      expect(getState().isAuthenticated).toBe(false);
    });

    it('logs out and clears the cache when the session expires', async () => {
      signIn();
      await sessionListeners.expired!();
      expect(mockClearCache).toHaveBeenCalledWith();
      expect(mockAuthLogout).not.toHaveBeenCalled();
      expect(getState().isAuthenticated).toBe(false);
      expect(getState().user).toBeNull();
    });

    it('ignores an expired event while logged out', async () => {
      await sessionListeners.expired!();
      expect(mockClearCache).not.toHaveBeenCalled();
    });
  });
});

describe('offline session', () => {
  const user = {
    id: 'u1',
    username: 'alice',
    displayName: 'Alice',
    role: 'member' as const,
    theme: 'light' as const,
    homeView: 'today' as const,
    dietaryPreferences: [],
    familyId: 'f1',
  };
  const DAY = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    mockGetHealth.mockResolvedValue({ status: 'ok', setupRequired: false });
    mockAuthRefresh.mockRejectedValue(new NetworkError());
  });

  afterEach(() => {
    // Leave offline mode so the module-level watcher is detached between tests.
    useAuthStore.setState({ sessionMode: 'online', isAuthenticated: false, user: null });
    onlineManager.setOnline(true);
    vi.useRealTimers();
  });

  async function coldStartOffline() {
    mockReadSnapshot.mockResolvedValue({ schema: 1, user, lastServerContactAt: Date.now() - DAY });
    await act(async () => {
      await getState().checkAuth();
    });
  }

  it('cold-starts authenticated and offline from a fresh snapshot', async () => {
    await coldStartOffline();
    expect(getState()).toMatchObject({
      user,
      isAuthenticated: true,
      sessionMode: 'offline',
      isLoading: false,
    });
    expect(mockBindCacheOwner).toHaveBeenCalledWith({ userId: 'u1', familyId: 'f1' });
    expect(mockSetAccessToken).toHaveBeenCalledWith(null);
    expect(mockSetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockClearCache).not.toHaveBeenCalled();
  });

  it('shows login when the snapshot is older than 7 days', async () => {
    mockReadSnapshot.mockResolvedValue({
      schema: 1,
      user,
      lastServerContactAt: Date.now() - 8 * DAY,
    });
    await act(async () => {
      await getState().checkAuth();
    });
    expect(getState().isAuthenticated).toBe(false);
    expect(getState().sessionMode).toBe('online');
    expect(mockClearSnapshot).toHaveBeenCalled();
    expect(mockClearCache).toHaveBeenCalledWith({ keepPersisted: true });
  });

  it('shows login and keeps the persisted cache with no snapshot', async () => {
    await act(async () => {
      await getState().checkAuth();
    });
    expect(getState().isAuthenticated).toBe(false);
    expect(mockClearCache).toHaveBeenCalledWith({ keepPersisted: true });
    expect(mockClearSnapshot).not.toHaveBeenCalled();
  });

  it('logs out, clears the snapshot and discards the queue on a rejected session', async () => {
    mockAuthRefresh.mockRejectedValue(new ApiError(401, 'nope'));
    mockReadSnapshot.mockResolvedValue({ schema: 1, user, lastServerContactAt: Date.now() });
    await act(async () => {
      await getState().checkAuth();
    });
    expect(getState().isAuthenticated).toBe(false);
    expect(mockClearSnapshot).toHaveBeenCalled();
    expect(mockClearCache).toHaveBeenCalledWith({ keepPersisted: false });
    expect(mockDiscardQueue).toHaveBeenCalled();
  });

  it('writes the snapshot and prefetches after an online checkAuth', async () => {
    mockAuthRefresh.mockResolvedValue({ user, accessToken: 't' });
    await act(async () => {
      await getState().checkAuth();
    });
    expect(mockWriteSnapshot).toHaveBeenCalledWith(user);
    expect(mockWarmPrefetch).toHaveBeenCalledTimes(1);
    expect(getState().sessionMode).toBe('online');
  });

  it('writes the snapshot and prefetches after login', async () => {
    mockAuthLogin.mockResolvedValue({ user, accessToken: 't' });
    await act(async () => {
      await getState().login('alice', 'pw');
    });
    expect(mockWriteSnapshot).toHaveBeenCalledWith(user);
    expect(mockWarmPrefetch).toHaveBeenCalledTimes(1);
  });

  it('clears the snapshot on logout', async () => {
    mockAuthLogout.mockResolvedValue(undefined);
    await act(async () => {
      await getState().logout();
    });
    expect(mockClearSnapshot).toHaveBeenCalled();
  });

  it('reconnects when connectivity returns: new token, online, resumes mutations', async () => {
    onlineManager.setOnline(false);
    await coldStartOffline();
    mockAuthRefresh.mockResolvedValue({ user, accessToken: 'fresh' });
    await act(async () => {
      onlineManager.setOnline(true);
    });
    await vi.waitFor(() => expect(getState().sessionMode).toBe('online'));
    expect(mockSetAccessToken).toHaveBeenCalledWith('fresh');
    expect(mockWriteSnapshot).toHaveBeenCalledWith(user);
    expect(mockResume).toHaveBeenCalled();
    expect(mockInvalidate).toHaveBeenCalled();
    expect(mockWarmPrefetch).toHaveBeenCalled();
    expect(mockDiscardQueue).not.toHaveBeenCalled();
  });

  it('single-flights concurrent reconnect triggers', async () => {
    onlineManager.setOnline(false);
    await coldStartOffline();
    mockAuthRefresh.mockClear();
    let resolve!: (v: unknown) => void;
    mockAuthRefresh.mockReturnValue(new Promise((r) => (resolve = r)));
    await act(async () => {
      onlineManager.setOnline(true);
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    expect(mockAuthRefresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ user, accessToken: 't' });
    });
    await vi.waitFor(() => expect(getState().sessionMode).toBe('online'));
  });

  it('logs out on reconnect when the server rejects the session', async () => {
    onlineManager.setOnline(false);
    await coldStartOffline();
    mockAuthRefresh.mockRejectedValue(new ApiError(401, 'revoked'));
    await act(async () => {
      onlineManager.setOnline(true);
    });
    await vi.waitFor(() => expect(getState().isAuthenticated).toBe(false));
    expect(mockClearSnapshot).toHaveBeenCalled();
    expect(mockDiscardQueue).toHaveBeenCalled();
    expect(mockClearCache).toHaveBeenCalledWith({ keepPersisted: false });
  });

  it('stays offline and retries after a network failure on reconnect', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await coldStartOffline();
    mockAuthRefresh.mockClear();
    mockAuthRefresh.mockRejectedValueOnce(new NetworkError());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONNECT_RETRY_MS);
    });
    expect(mockAuthRefresh).toHaveBeenCalledTimes(1);
    expect(getState().sessionMode).toBe('offline');
    mockAuthRefresh.mockResolvedValue({ user, accessToken: 't' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONNECT_RETRY_MS);
    });
    expect(getState().sessionMode).toBe('online');
  });

  it('rebinds the cache and discards the queue if the reconnected owner differs', async () => {
    onlineManager.setOnline(false);
    await coldStartOffline();
    const other = { ...user, id: 'u2' };
    mockAuthRefresh.mockResolvedValue({ user: other, accessToken: 't' });
    await act(async () => {
      onlineManager.setOnline(true);
    });
    await vi.waitFor(() => expect(getState().sessionMode).toBe('online'));
    expect(mockBindCacheOwner).toHaveBeenLastCalledWith({ userId: 'u2', familyId: 'f1' });
    expect(mockDiscardQueue).toHaveBeenCalled();
    expect(getState().user).toEqual(other);
  });

  it('goes online when a silent request refresh succeeds while offline', async () => {
    onlineManager.setOnline(false);
    await coldStartOffline();
    await act(async () => {
      await sessionListeners.refreshed!(user);
    });
    expect(getState().sessionMode).toBe('online');
    expect(mockResume).toHaveBeenCalled();
  });

  it('discards the queue when the session expires', async () => {
    useAuthStore.setState({ user, isAuthenticated: true });
    await sessionListeners.expired!();
    expect(mockDiscardQueue).toHaveBeenCalled();
    expect(mockClearSnapshot).toHaveBeenCalled();
  });
});
