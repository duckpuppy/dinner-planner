import { create } from 'zustand';
import { auth as authApi, getHealth, setAccessToken, type User } from '@/lib/api';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setupRequired: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  setupComplete: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setupRequired: false,

  login: async (username: string, password: string) => {
    const result = await authApi.login(username, password);
    setAccessToken(result.accessToken);
    set({ user: result.user, isAuthenticated: true });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors
    }
    setAccessToken(null);
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const health = await getHealth();
      if (health.setupRequired) {
        set({ setupRequired: true, isAuthenticated: false, isLoading: false });
        return;
      }
    } catch {
      // If health check fails, fall through to normal auth check
    }
    try {
      const result = await authApi.refresh();
      setAccessToken(result.accessToken);
      set({ user: result.user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      console.error('[checkAuth] Failed to refresh session:', err);
      setAccessToken(null);
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  updateUser: (updates) => {
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    }));
  },

  setupComplete: () => {
    set({ setupRequired: false });
  },
}));
