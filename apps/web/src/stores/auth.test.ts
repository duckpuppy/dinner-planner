import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';

const {
  mockGetHealth,
  mockAuthRefresh,
  mockAuthLogin,
  mockAuthLogout,
  mockSetAccessToken,
  mockBindCacheOwner,
  mockClearCache,
  sessionListeners,
} = vi.hoisted(() => ({
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

vi.mock('@/lib/api', () => ({
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
import { useAuthStore } from './auth';
import { ApiError } from '@/lib/api';

function getState() {
  return useAuthStore.getState();
}

function resetStore() {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    setupRequired: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBindCacheOwner.mockResolvedValue(undefined);
  mockClearCache.mockResolvedValue(undefined);
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
