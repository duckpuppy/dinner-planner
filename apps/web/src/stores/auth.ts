import { onlineManager } from '@tanstack/react-query';
import { create } from 'zustand';
import {
  ApiError,
  auth as authApi,
  getHealth,
  NetworkError,
  onSessionExpired,
  onSessionRefreshed,
  setAccessToken,
  type User,
} from '@/lib/api';
import { probe } from '@/lib/connectivity';
import { discardQueueAndNotify } from '@/lib/mutationQueuePersistence';
import { queryClient } from '@/lib/queryClient';
import { bindCacheOwner, clearCache } from '@/lib/queryPersistence';
import { clearSnapshot, isSnapshotFresh, readSnapshot, writeSnapshot } from '@/lib/sessionSnapshot';
import { warmPrefetch } from '@/lib/warmPrefetch';

export type SessionMode = 'online' | 'offline';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setupRequired: boolean;
  /** 'offline' = cold-started from the session snapshot; no access token until we reconnect. */
  sessionMode: SessionMode;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  setupComplete: () => void;
}

export const RECONNECT_RETRY_MS = 15_000;

function ownerOf(user: User) {
  return { userId: user.id, familyId: user.familyId };
}

function sameOwner(a: User, b: User) {
  return a.id === b.id && a.familyId === b.familyId;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  setupRequired: false,
  sessionMode: 'online',

  login: async (username: string, password: string) => {
    const result = await authApi.login(username, password);
    setAccessToken(result.accessToken);
    await bindCacheOwner(ownerOf(result.user));
    await writeSnapshot(result.user);
    set({ user: result.user, isAuthenticated: true, sessionMode: 'online' });
    warmPrefetch();
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors
    }
    setAccessToken(null);
    await clearSnapshot();
    await clearCache();
    set({ user: null, isAuthenticated: false, sessionMode: 'online' });
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
      await writeSnapshot(result.user);
      set({ user: result.user, isAuthenticated: true, isLoading: false, sessionMode: 'online' });
      warmPrefetch();
    } catch (err) {
      console.error('[checkAuth] Failed to refresh session:', err);
      setAccessToken(null);

      if (err instanceof ApiError) {
        // Rejected session: wipe both caches, the snapshot and any queued offline writes.
        await endRejectedSession(clearEverything);
        set({ user: null, isAuthenticated: false, isLoading: false, sessionMode: 'online' });
        return;
      }

      if (err instanceof NetworkError) {
        const snapshot = await readSnapshot();
        if (snapshot && isSnapshotFresh(snapshot)) {
          // Server unreachable but we have a recent session: render the cached data offline.
          await bindCacheOwner(ownerOf(snapshot.user));
          set({
            user: snapshot.user,
            isAuthenticated: true,
            isLoading: false,
            sessionMode: 'offline',
          });
          return;
        }
        if (snapshot) await clearSnapshot(); // older than 7 days
      }

      // No usable session. A network failure only drops the in-memory cache; the persisted
      // one stays owner-scoped on disk.
      await clearCache({ keepPersisted: true });
      set({ user: null, isAuthenticated: false, isLoading: false, sessionMode: 'online' });
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

/** The server rejected the session: drop every trace of it, and tell the user about lost writes. */
async function endRejectedSession(clear: () => Promise<void> = () => clearCache()) {
  await clearSnapshot();
  await clear();
  await discardQueueAndNotify();
}

const clearEverything = () => clearCache({ keepPersisted: false });

// --- Offline session reconnect -------------------------------------------------------------

let reconnectInFlight: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let unsubscribeOnline: (() => void) | undefined;

function isOffline() {
  return useAuthStore.getState().sessionMode === 'offline';
}

function stopReconnectWatch() {
  clearTimeout(retryTimer);
  retryTimer = undefined;
  unsubscribeOnline?.();
  unsubscribeOnline = undefined;
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    if (isOffline()) void reconnect();
  }, RECONNECT_RETRY_MS);
}

/**
 * Switch an offline session to online once we hold a fresh access token and user. Handles the
 * (unexpected) case that the server now reports a different user or family.
 */
async function goOnline(user: User) {
  const current = useAuthStore.getState().user;
  if (current && !sameOwner(current, user)) {
    // Owner change: resets in-memory queries, deletes the persisted cache, and the queued
    // writes belonged to someone else.
    await bindCacheOwner(ownerOf(user));
    await discardQueueAndNotify();
  }
  if (!isOffline()) return; // logged out (or already online) while we awaited
  await writeSnapshot(user);
  useAuthStore.setState({ user, sessionMode: 'online' });
  stopReconnectWatch();
  void queryClient.resumePausedMutations();
  void queryClient.invalidateQueries();
  warmPrefetch();
}

/** Re-run refresh for an offline session. Single flight. */
function reconnect(): Promise<void> {
  reconnectInFlight ??= (async () => {
    try {
      const result = await authApi.refresh();
      if (!isOffline()) return;
      setAccessToken(result.accessToken);
      await goOnline(result.user);
    } catch (err) {
      if (!isOffline()) return;
      if (err instanceof ApiError) {
        setAccessToken(null);
        await endRejectedSession(clearEverything);
        useAuthStore.setState({
          user: null,
          isAuthenticated: false,
          sessionMode: 'online',
        });
        return;
      }
      // NetworkError (or anything unexpected): stay offline and try again later.
      scheduleRetry();
    }
  })().finally(() => {
    reconnectInFlight = null;
  });
  return reconnectInFlight;
}

function startReconnectWatch() {
  if (unsubscribeOnline) return;
  unsubscribeOnline = onlineManager.subscribe((online) => {
    if (online && isOffline()) void reconnect();
  });
  scheduleRetry();
  // Make connectivity state reflect reality; a transition to online triggers reconnect().
  void probe().catch(() => {});
}

useAuthStore.subscribe((state, prev) => {
  if (state.sessionMode === prev.sessionMode) return;
  if (state.sessionMode === 'offline') startReconnectWatch();
  else stopReconnectWatch();
});

// Silent refresh (api.ts) can outlive the state this store last saw: the user may have been
// moved to another family, or the session may have died. Keep the store and cache owner in sync.
onSessionRefreshed(async (user) => {
  const current = useAuthStore.getState();
  if (!current.isAuthenticated || !current.user) return;
  if (current.sessionMode === 'offline') {
    // A request got through and refreshed on its own: we are back online.
    await goOnline(user);
    return;
  }
  if (!sameOwner(current.user, user)) {
    // Owner change: resets in-memory queues and deletes the persisted cache.
    await bindCacheOwner(ownerOf(user));
    // Logout may have happened while we awaited.
    if (!useAuthStore.getState().isAuthenticated) return;
  }
  await writeSnapshot(user);
  useAuthStore.setState({ user });
});

onSessionExpired(async () => {
  if (!useAuthStore.getState().isAuthenticated) return;
  await endRejectedSession();
  useAuthStore.setState({ user: null, isAuthenticated: false, sessionMode: 'online' });
});
