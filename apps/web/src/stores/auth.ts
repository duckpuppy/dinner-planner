import { create } from 'zustand';
import { auth as authApi, setAccessToken, type User } from '@/lib/api';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

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
      const result = await authApi.refresh();
      setAccessToken(result.accessToken);
      set({ user: result.user, isAuthenticated: true, isLoading: false });
    } catch {
      setAccessToken(null);
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
