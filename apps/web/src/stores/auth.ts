import { create } from 'zustand';
import {
  ApiError,
  auth as authApi,
  getHealth,
  onSessionExpired,
  onSessionRefreshed,
  setAccessToken,
  type User,
} from '@/lib/api';
import { bindCacheOwner, clearCache } from '@/lib/queryPersistence';

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

function ownerOf(user: User) {
  return { userId: user.id, familyId: user.familyId };
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setupRequired: false,

  login: async (username: string, password: string) => {
    const result = await authApi.login(username, password);
    setAccessToken(result.accessToken);
    await bindCacheOwner(ownerOf(result.user));
    set({ user: result.user, isAuthenticated: true });
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors
    }
    setAccessToken(null);
    await clearCache();
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const health = await getHealth();
      if (health.setupRequired) {
        setAccessToken(null);
        await clearCache();
        set({ setupRequired: true, isAuthenticated: false, isLoading: false });
        return;
      }
    } catch {
      // If health check fails, fall through to normal auth check
    }
    try {
      const result = await authApi.refresh();
      setAccessToken(result.accessToken);
      // Restore the persisted cache only if it belongs to this user + family, and do it
      // before flipping isAuthenticated so no other owner's data can ever render.
      await bindCacheOwner(ownerOf(result.user));
      set({ user: result.user, isAuthenticated: true, isLoading: false });
    } catch (err) {
      console.error('[checkAuth] Failed to refresh session:', err);
      setAccessToken(null);
      // A rejected session wipes both caches. A network failure only drops the in-memory
      // cache; the persisted one stays owner-scoped on disk.
      await clearCache({ keepPersisted: !(err instanceof ApiError) });
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

// Silent refresh (api.ts) can outlive the state this store last saw: the user may have been
// moved to another family, or the session may have died. Keep the store and cache owner in sync.
onSessionRefreshed(async (user) => {
  const current = useAuthStore.getState();
  if (!current.isAuthenticated || !current.user) return;
  if (current.user.id !== user.id || current.user.familyId !== user.familyId) {
    // Owner change: resets in-memory queries and deletes the persisted cache.
    await bindCacheOwner(ownerOf(user));
    // Logout may have happened while we awaited.
    if (!useAuthStore.getState().isAuthenticated) return;
  }
  useAuthStore.setState({ user });
});

onSessionExpired(async () => {
  if (!useAuthStore.getState().isAuthenticated) return;
  await clearCache();
  useAuthStore.setState({ user: null, isAuthenticated: false });
});
