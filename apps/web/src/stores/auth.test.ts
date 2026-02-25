import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';

const { mockGetHealth, mockAuthRefresh, mockAuthLogin, mockAuthLogout, mockSetAccessToken } =
  vi.hoisted(() => ({
    mockGetHealth: vi.fn(),
    mockAuthRefresh: vi.fn(),
    mockAuthLogin: vi.fn(),
    mockAuthLogout: vi.fn(),
    mockSetAccessToken: vi.fn(),
  }));

vi.mock('@/lib/api', () => ({
  getHealth: mockGetHealth,
  setAccessToken: mockSetAccessToken,
  auth: {
    refresh: mockAuthRefresh,
    login: mockAuthLogin,
    logout: mockAuthLogout,
  },
}));

// Import AFTER mocking
import { useAuthStore } from './auth';

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
      };
      mockAuthRefresh.mockResolvedValue({ user: fakeUser, accessToken: 'token123' });
      await act(async () => {
        await getState().checkAuth();
      });
      expect(getState().isAuthenticated).toBe(true);
      expect(getState().user).toEqual(fakeUser);
      expect(getState().setupRequired).toBe(false);
      expect(mockSetAccessToken).toHaveBeenCalledWith('token123');
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
});
