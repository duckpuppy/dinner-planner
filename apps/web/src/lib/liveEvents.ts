import { onlineManager } from '@tanstack/react-query';
import { create } from 'zustand';
import { getAccessToken, refreshSession, streamRequestInit } from './api';
import { apiUrl } from './apiOrigin';
import { createSseParser } from './sseParser';
import { useAuthStore } from '@/stores/auth';

/**
 * Live events client for GET /api/events. A fetch-streaming SSE reader (not EventSource, which
 * cannot send an Authorization header). One shared connection, ref-counted by acquireLive().
 *
 * The server ends the stream when the access token expires; the loop then refreshes (single
 * flight, shared with request()'s 401 handling) and reconnects with Last-Event-ID so the server
 * replays what was missed (or sends `reset`, which makes consumers refetch).
 */

export const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;
export const WATCHDOG_MS = 45_000;
export const HEALTHY_MS = 60_000;
/** A stream that closed before this long is treated as a failure (backoff), not a token-exp close. */
export const MIN_STABLE_MS = 5_000;
/** Refresh before connecting when the access token has less than this left. */
export const TOKEN_SKEW_MS = 30_000;

export interface LiveEvent {
  /** SSE event name, e.g. 'grocery.check', 'reset'. */
  type: string;
  /** Parsed JSON payload; undefined for empty or unparseable data. */
  data: unknown;
  id?: string;
}

export type LiveListener = (event: LiveEvent) => void;

interface LiveState {
  connected: boolean;
}

export const useLiveStore = create<LiveState>(() => ({ connected: false }));

function setConnected(connected: boolean) {
  if (useLiveStore.getState().connected !== connected) useLiveStore.setState({ connected });
}

/** True while the shared stream is open. */
export function useLiveConnected(): boolean {
  return useLiveStore((s) => s.connected);
}

/** Seconds-precision JWT `exp` check. Undecodable tokens are treated as not expiring. */
export function tokenExpiresWithin(token: string, ms: number, now = Date.now()): boolean {
  try {
    const part = token.split('.')[1];
    if (!part) return false;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    if (typeof exp !== 'number') return false;
    return exp * 1000 - now < ms;
  } catch {
    return false;
  }
}

export function backoffDelay(attempt: number, random = Math.random()): number {
  const base = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
  return Math.round(base + random * base * 0.3);
}

// ---------------------------------------------------------------------------
// connection loop
// ---------------------------------------------------------------------------

const listeners = new Set<LiveListener>();
let refCount = 0;
let running = false;
let runId = 0;
let abort: AbortController | null = null;
let wakeSleep: (() => void) | null = null;
let lastEventId: string | null = null;
let ownerId: string | null = null;
let teardown: (() => void) | null = null;

function eligible(): boolean {
  if (refCount <= 0 || !onlineManager.isOnline()) return false;
  const auth = useAuthStore.getState();
  return auth.isAuthenticated && auth.sessionMode === 'online' && getAccessToken() !== null;
}

function emit(event: LiveEvent) {
  for (const l of [...listeners]) {
    try {
      l(event);
    } catch (err) {
      console.error('[live] listener failed:', err);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      wakeSleep = null;
      resolve();
    }, ms);
    wakeSleep = () => {
      clearTimeout(t);
      wakeSleep = null;
      resolve();
    };
  });
}

type Outcome =
  | { kind: 'rejected' }
  | { kind: 'unauthorized' }
  | { kind: 'failed' }
  | { kind: 'closed'; openMs: number };

async function readStream(res: Response, ac: AbortController): Promise<Outcome> {
  const openedAt = Date.now();
  const decoder = new TextDecoder();
  const parser = createSseParser({
    onFrame: (frame) => {
      if (frame.id) lastEventId = frame.id;
      let data: unknown;
      if (frame.data) {
        try {
          data = JSON.parse(frame.data);
        } catch {
          data = undefined;
        }
      }
      emit({ type: frame.event, data, id: frame.id });
    },
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => ac.abort(), WATCHDOG_MS);
  };
  arm();
  const reader = res.body!.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      arm();
      parser.push(decoder.decode(value, { stream: true }));
    }
    return { kind: 'closed', openMs: Date.now() - openedAt };
  } catch {
    // Watchdog abort, network drop, or stop(): the caller checks whether the run is still alive.
    return { kind: 'failed' };
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => undefined);
  }
}

async function connectOnce(ac: AbortController, alive: () => boolean): Promise<Outcome> {
  const token = getAccessToken();
  if (token && tokenExpiresWithin(token, TOKEN_SKEW_MS)) {
    if ((await refreshSession()) === 'rejected') return { kind: 'rejected' };
    if (!alive()) return { kind: 'failed' };
  }
  const res = await fetch(
    apiUrl('/api/events'),
    streamRequestInit(ac.signal, lastEventId ? { 'Last-Event-ID': lastEventId } : {})
  );
  if (!alive()) {
    void res.body?.cancel().catch(() => undefined);
    return { kind: 'failed' };
  }
  if (res.status === 401) {
    void res.body?.cancel().catch(() => undefined);
    return { kind: 'unauthorized' };
  }
  if (!res.ok || !res.body) {
    void res.body?.cancel().catch(() => undefined);
    return { kind: 'failed' };
  }
  setConnected(true);
  try {
    return await readStream(res, ac);
  } finally {
    setConnected(false);
  }
}

async function loop(myRun: number): Promise<void> {
  const alive = () => myRun === runId;
  let attempt = 0;
  let unauthorizedStreak = 0;

  while (alive() && eligible()) {
    const ac = new AbortController();
    abort = ac;
    let outcome: Outcome;
    try {
      outcome = await connectOnce(ac, alive);
    } catch {
      outcome = { kind: 'failed' };
    }
    if (!alive()) return;

    if (outcome.kind === 'rejected') break; // session is dead; the auth store handles logout

    if (outcome.kind === 'unauthorized') {
      unauthorizedStreak += 1;
      if (unauthorizedStreak === 1) {
        try {
          if ((await refreshSession()) === 'rejected') break;
        } catch {
          // Network trouble during refresh: fall through to backoff below.
          await sleep(backoffDelay(attempt++));
          continue;
        }
        if (!alive()) return;
        continue; // fresh token: reconnect right away
      }
      await sleep(backoffDelay(attempt++));
      continue;
    }
    unauthorizedStreak = 0;

    if (outcome.kind === 'closed' && outcome.openMs >= HEALTHY_MS) attempt = 0;
    if (outcome.kind === 'closed' && outcome.openMs >= MIN_STABLE_MS) continue; // token-exp close
    await sleep(backoffDelay(attempt++));
  }

  if (alive()) {
    running = false;
    setConnected(false);
  }
}

function startLoop() {
  running = true;
  const myRun = ++runId;
  void loop(myRun);
}

function stopLoop() {
  runId += 1;
  running = false;
  abort?.abort();
  abort = null;
  wakeSleep?.();
  setConnected(false);
}

function evaluate() {
  const should = eligible();
  if (should && !running) startLoop();
  else if (!should && running) stopLoop();
}

/**
 * Take a reference on the shared stream. The connection opens when the first reference is taken
 * (and the session is online) and closes when the last is released. Returns an idempotent release.
 */
export function acquireLive(): () => void {
  refCount += 1;
  if (refCount === 1) {
    ownerId = useAuthStore.getState().user?.id ?? null;
    const offOnline = onlineManager.subscribe(() => evaluate());
    const offAuth = useAuthStore.subscribe((state) => {
      const next = state.user?.id ?? null;
      if (next !== ownerId) {
        ownerId = next;
        lastEventId = null; // event ids are not meaningful across users
        if (running) stopLoop(); // restarted below with the new identity
      }
      evaluate();
    });
    teardown = () => {
      offOnline();
      offAuth();
    };
  }
  evaluate();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    refCount -= 1;
    if (refCount === 0) {
      teardown?.();
      teardown = null;
      stopLoop();
    }
  };
}

/** Subscribe to parsed events from the shared stream. Returns an unsubscribe function. */
export function subscribeLive(listener: LiveListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The id sent as Last-Event-ID on the next connect (exposed for tests). */
export function getLastEventId(): string | null {
  return lastEventId;
}

/** Reset all module state (tests only). */
export function resetLiveEventsForTests(): void {
  teardown?.();
  teardown = null;
  stopLoop();
  refCount = 0;
  lastEventId = null;
  ownerId = null;
  listeners.clear();
}
