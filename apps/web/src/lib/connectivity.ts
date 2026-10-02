import { onlineManager } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { fetchHealth, setConnectivityHooks } from './api';
import { touchServerContact } from './sessionSnapshot';

/**
 * Owns TanStack Query's online state. Browser/WebView signals (navigator.onLine, online/offline
 * events, the Capacitor Network plugin) only say whether a link exists, not whether the server
 * is reachable (think Wi-Fi without internet), and on Android WebView they do not fire at all.
 * So they are treated purely as triggers: every trigger runs a /health probe and only the probe
 * result can set the state online. The one exception is an explicit "no network" signal, which
 * sets offline immediately (and keeps probing).
 */

export interface ConnectivityState {
  online: boolean;
  lastChangeAt: number;
  probing: boolean;
}

export const BACKOFF_MS = [5_000, 10_000, 20_000, 40_000, 60_000] as const;

let state: ConnectivityState = { online: true, lastChangeAt: Date.now(), probing: false };
const subscribers = new Set<() => void>();

let setManagerOnline: ((online: boolean) => void) | null = null;
let inflight: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let backoffIndex = 0;
let generation = 0;
let teardown: (() => void) | null = null;

export function getConnectivityState(): ConnectivityState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

function update(patch: Partial<ConnectivityState>) {
  const next = { ...state, ...patch };
  if (next.online !== state.online) next.lastChangeAt = Date.now();
  if (
    next.online === state.online &&
    next.probing === state.probing &&
    next.lastChangeAt === state.lastChangeAt
  ) {
    return;
  }
  state = next;
  subscribers.forEach((l) => l());
}

function clearRetry() {
  if (retryTimer !== null) clearTimeout(retryTimer);
  retryTimer = null;
}

function applyOnline(online: boolean) {
  update({ online });
  setManagerOnline?.(online);
}

function scheduleRetry() {
  clearRetry();
  const delay = BACKOFF_MS[Math.min(backoffIndex, BACKOFF_MS.length - 1)];
  backoffIndex += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void probe();
  }, delay);
}

/** Run a /health probe (deduped). Success sets online, failure sets offline and backs off. */
export function probe(): Promise<void> {
  if (inflight) return inflight;
  const gen = generation;
  update({ probing: true });
  inflight = (async () => {
    const ok = await fetchHealth({ cache: 'no-store' }).then(
      (res) => res.ok,
      () => false
    );
    if (gen !== generation) return; // stopped or restarted while in flight
    if (ok) {
      touchServerContact();
      clearRetry();
      backoffIndex = 0;
      applyOnline(true);
    } else {
      applyOnline(false);
      scheduleRetry();
    }
  })().finally(() => {
    if (gen === generation) {
      inflight = null;
      update({ probing: false });
    }
  });
  return inflight;
}

function markOfflineAndProbe() {
  applyOnline(false);
  void probe();
}

/** Called when a request failed without any HTTP response (not for caller aborts). */
export function reportFailure(): void {
  if (!state.online) return; // already offline: the backoff schedule is driving probes
  void probe();
}

/** Called when a request got a 2xx response: proves the server is reachable. */
export function reportSuccess(): void {
  if (state.online) return;
  clearRetry();
  backoffIndex = 0;
  applyOnline(true);
}

function setup(setOnline: (online: boolean) => void): () => void {
  setManagerOnline = setOnline;
  setOnline(state.online);
  const cleanups: Array<() => void> = [];

  const onVisibility = () => {
    if (document.visibilityState === 'visible') void probe();
  };
  document.addEventListener('visibilitychange', onVisibility);
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

  if (Capacitor.isNativePlatform()) {
    // WebView navigator.onLine and window online/offline events are unreliable on Android.
    let removed = false;
    let handle: { remove: () => Promise<void> } | null = null;
    const onStatus = (status: { connected: boolean }) => {
      if (status.connected) void probe();
      else markOfflineAndProbe();
    };
    void Network.addListener('networkStatusChange', onStatus)
      .then((h) => {
        if (removed) void h.remove();
        else handle = h;
      })
      .catch(() => {});
    void Network.getStatus().then(onStatus, () => void probe());
    cleanups.push(() => {
      removed = true;
      void handle?.remove();
    });
  } else {
    const onOnline = () => void probe();
    const onOffline = () => markOfflineAndProbe();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    cleanups.push(() => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    });
    if (typeof navigator !== 'undefined' && navigator.onLine === false) markOfflineAndProbe();
  }

  return () => {
    cleanups.forEach((c) => c());
    clearRetry();
    setManagerOnline = null;
  };
}

/** Install the connectivity listener on onlineManager and hook request() outcomes. Idempotent. */
export function startConnectivity(): void {
  if (teardown) return;
  setConnectivityHooks({
    onSuccess: () => {
      touchServerContact();
      reportSuccess();
    },
    onFailure: () => reportFailure(),
  });
  let inner: (() => void) | null = null;
  onlineManager.setEventListener((setOnline) => {
    inner?.();
    inner = setup(setOnline);
    return () => {
      inner?.();
      inner = null;
    };
  });
  teardown = () => {
    inner?.();
    inner = null;
  };
}

/** Remove all listeners and timers and reset state (app teardown and tests). */
export function stopConnectivity(): void {
  teardown?.();
  teardown = null;
  generation += 1;
  inflight = null;
  backoffIndex = 0;
  setConnectivityHooks({});
  state = { online: true, lastChangeAt: Date.now(), probing: false };
  setManagerOnline = null;
  subscribers.forEach((l) => l());
  onlineManager.setOnline(true);
}
