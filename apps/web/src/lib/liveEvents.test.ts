import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onlineManager } from '@tanstack/react-query';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  refreshSession: vi.fn(),
}));

import { refreshSession, setAccessToken } from './api';
import {
  acquireLive,
  backoffDelay,
  getLastEventId,
  resetLiveEventsForTests,
  subscribeLive,
  tokenExpiresWithin,
  useLiveStore,
  type LiveEvent,
} from './liveEvents';
import { useAuthStore } from '@/stores/auth';

const enc = new TextEncoder();

function jwt(expSec: number): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${b64({ alg: 'none' })}.${b64({ exp: expSec })}.sig`;
}
const farFuture = () => jwt(Math.floor(Date.now() / 1000) + 3600);

interface FakeStream {
  response: Response;
  push: (s: string) => void;
  close: () => void;
}

function makeStream(signal?: AbortSignal | null): FakeStream {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  signal?.addEventListener('abort', () => {
    try {
      ctrl.error(new DOMException('Aborted', 'AbortError'));
    } catch {
      // already closed
    }
  });
  return {
    response: new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    push: (s) => ctrl.enqueue(enc.encode(s)),
    close: () => ctrl.close(),
  };
}

const fetchMock = vi.fn();
const flush = () => vi.advanceTimersByTimeAsync(0);

function setSession(over: Partial<ReturnType<typeof useAuthStore.getState>> = {}) {
  useAuthStore.setState({
    isAuthenticated: true,
    sessionMode: 'online',
    user: { id: 'u1' } as never,
    ...over,
  });
}

function headersOf(call: number): Record<string, string> {
  return (fetchMock.mock.calls[call][1] as RequestInit).headers as Record<string, string>;
}

describe('liveEvents helpers', () => {
  it('backoffDelay follows 1s,2s,5s,10s,30s cap with jitter', () => {
    expect([0, 1, 2, 3, 4, 9].map((a) => backoffDelay(a, 0))).toEqual([
      1000, 2000, 5000, 10000, 30000, 30000,
    ]);
    expect(backoffDelay(0, 1)).toBe(1300);
  });

  it('tokenExpiresWithin reads the JWT exp', () => {
    const now = 1_000_000_000_000;
    expect(tokenExpiresWithin(jwt(now / 1000 + 10), 30_000, now)).toBe(true);
    expect(tokenExpiresWithin(jwt(now / 1000 + 600), 30_000, now)).toBe(false);
    expect(tokenExpiresWithin('garbage', 30_000, now)).toBe(false);
    expect(tokenExpiresWithin('a.b.c', 30_000, now)).toBe(false);
  });
});

describe('live events connection', () => {
  let streams: FakeStream[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    streams = [];
    fetchMock.mockReset();
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      const s = makeStream(init?.signal);
      streams.push(s);
      return Promise.resolve(s.response);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(refreshSession).mockReset();
    onlineManager.setOnline(true);
    setAccessToken(farFuture());
    setSession();
  });

  afterEach(() => {
    resetLiveEventsForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    setAccessToken(null);
    onlineManager.setOnline(true);
  });

  it('connects with auth headers and reports connected', async () => {
    const release = acquireLive();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/events');
    expect(headersOf(0).Authorization).toMatch(/^Bearer /);
    expect(headersOf(0)['Last-Event-ID']).toBeUndefined();
    expect(useLiveStore.getState().connected).toBe(true);
    release();
    expect(useLiveStore.getState().connected).toBe(false);
  });

  it('emits parsed events and tracks the last event id', async () => {
    const seen: LiveEvent[] = [];
    const off = subscribeLive((e) => seen.push(e));
    acquireLive();
    await flush();
    streams[0].push('retry: 3000\n\n: ping\n\n');
    streams[0].push('id: i:1\nevent: pantry.delete\ndata: {"id":"p1"}\n\n');
    streams[0].push('id: i:2\nevent: reset\ndata:\n\n');
    await flush();
    expect(seen).toEqual([
      { type: 'pantry.delete', data: { id: 'p1' }, id: 'i:1' },
      { type: 'reset', data: undefined, id: 'i:2' },
    ]);
    expect(getLastEventId()).toBe('i:2');
    off();
  });

  it('ignores malformed JSON and a throwing listener', async () => {
    const seen: LiveEvent[] = [];
    subscribeLive(() => {
      throw new Error('boom');
    });
    subscribeLive((e) => seen.push(e));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    acquireLive();
    await flush();
    streams[0].push('event: x\ndata: {not json\n\n');
    await flush();
    expect(seen).toEqual([{ type: 'x', data: undefined, id: undefined }]);
  });

  it('reconnects right away after a normal close and sends Last-Event-ID', async () => {
    acquireLive();
    await flush();
    streams[0].push('id: i:7\nevent: reset\ndata:\n\n');
    await vi.advanceTimersByTimeAsync(10_000); // a long-lived stream, like one that hit token exp
    streams[0].close();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(headersOf(1)['Last-Event-ID']).toBe('i:7');
  });

  it('backs off after a stream that closes immediately', async () => {
    acquireLive();
    await flush();
    streams[0].close();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('escalates backoff 1s, 2s, 5s on repeated failures and resets after a healthy stream', async () => {
    fetchMock.mockReset();
    fetchMock.mockRejectedValue(new TypeError('network'));
    acquireLive();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(4999);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // A stream that stays up for 60s resets the schedule.
    const s = makeStream();
    fetchMock.mockImplementationOnce(() => Promise.resolve(s.response));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(useLiveStore.getState().connected).toBe(true);
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(15_000);
      s.push(': ping\n\n');
    }
    s.close();
    fetchMock.mockClear();
    fetchMock.mockRejectedValue(new TypeError('network'));
    await flush();
    // Healthy stream closed after >60s: reconnects immediately (attempt reset).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(2); // second step is 2s again, not 5s: it restarted at 1s
  });

  it('aborts and reconnects when no bytes arrive for 45s', async () => {
    acquireLive();
    await flush();
    await vi.advanceTimersByTimeAsync(44_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_001);
    await vi.advanceTimersByTimeAsync(1_000); // backoff
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });

  it('keeps the connection while heartbeats arrive', async () => {
    acquireLive();
    await flush();
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(25_000);
      streams[0].push(': ping\n\n');
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useLiveStore.getState().connected).toBe(true);
  });

  it('refreshes on 401 and reconnects immediately', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      const s = makeStream(init?.signal);
      streams.push(s);
      return Promise.resolve(s.response);
    });
    vi.mocked(refreshSession).mockResolvedValue('refreshed');
    acquireLive();
    await flush();
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useLiveStore.getState().connected).toBe(true);
  });

  it('stops when the refresh is rejected after a 401', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    vi.mocked(refreshSession).mockResolvedValue('rejected');
    acquireLive();
    await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useLiveStore.getState().connected).toBe(false);
  });

  it('backs off when 401 repeats after a successful refresh', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));
    vi.mocked(refreshSession).mockResolvedValue('refreshed');
    acquireLive();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(600);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('backs off when the refresh hits a network error', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      const s = makeStream(init?.signal);
      streams.push(s);
      return Promise.resolve(s.response);
    });
    vi.mocked(refreshSession).mockRejectedValueOnce(new Error('offline'));
    acquireLive();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1001);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('backs off on a non-OK response', async () => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(new Response('x', { status: 503 }));
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      const s = makeStream(init?.signal);
      streams.push(s);
      return Promise.resolve(s.response);
    });
    acquireLive();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1001);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refreshes before connecting when the token is about to expire', async () => {
    setAccessToken(jwt(Math.floor(Date.now() / 1000) + 5));
    vi.mocked(refreshSession).mockResolvedValue('refreshed');
    acquireLive();
    await flush();
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not connect if the pre-connect refresh is rejected', async () => {
    setAccessToken(jwt(Math.floor(Date.now() / 1000) - 5));
    vi.mocked(refreshSession).mockResolvedValue('rejected');
    acquireLive();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disconnects when offline and reconnects when back online', async () => {
    acquireLive();
    await flush();
    expect(useLiveStore.getState().connected).toBe(true);
    onlineManager.setOnline(false);
    await flush();
    expect(useLiveStore.getState().connected).toBe(false);
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
    onlineManager.setOnline(true);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useLiveStore.getState().connected).toBe(true);
  });

  it('does not connect while offline, in offline session mode, or without a token', async () => {
    const evCalls = () => fetchMock.mock.calls.filter((c) => c[0] === '/api/events').length;
    onlineManager.setOnline(false);
    const r1 = acquireLive();
    await flush();
    expect(evCalls()).toBe(0);
    r1();
    onlineManager.setOnline(true);

    setSession({ sessionMode: 'offline' });
    const r2 = acquireLive();
    await flush();
    expect(evCalls()).toBe(0);
    // Reconnecting the session starts the stream.
    setSession({ sessionMode: 'online' });
    await flush();
    expect(evCalls()).toBe(1);
    r2();

    setAccessToken(null);
    acquireLive();
    await flush();
    expect(evCalls()).toBe(1);
  });

  it('shares one connection across holders and closes after the last release', async () => {
    const a = acquireLive();
    const b = acquireLive();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    a();
    a(); // idempotent
    expect(useLiveStore.getState().connected).toBe(true);
    b();
    expect(useLiveStore.getState().connected).toBe(false);
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps Last-Event-ID across a release/acquire cycle but drops it for another user', async () => {
    const r = acquireLive();
    await flush();
    streams[0].push('id: i:3\nevent: reset\ndata:\n\n');
    await flush();
    r();
    acquireLive();
    await flush();
    expect(headersOf(1)['Last-Event-ID']).toBe('i:3');

    setSession({ user: { id: 'u2' } as never });
    await flush();
    expect(getLastEventId()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(headersOf(2)['Last-Event-ID']).toBeUndefined();
  });
});
