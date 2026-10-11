import { useEffect, useState } from 'react';
import { msUntilNextMidnight, msUntilNextMinute } from '@/lib/kioskTime';
import { KioskAuthError, clearStoredKioskKey, fetchKioskWeek, type KioskWeek } from '@/lib/kiosk';

export const KIOSK_POLL_MS = 60_000;
const CURSOR_HIDE_MS = 3_000;

/**
 * The device's current time, refreshed on every minute boundary, at local midnight, every 60s
 * (timer drift / DST) and when the page becomes visible again (device sleep).
 */
export function useLocalNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let minuteTimer: ReturnType<typeof setTimeout>;
    let midnightTimer: ReturnType<typeof setTimeout>;
    const tick = () => setNow(new Date());
    const armMinute = () => {
      minuteTimer = setTimeout(() => {
        tick();
        armMinute();
      }, msUntilNextMinute(new Date()));
    };
    const armMidnight = () => {
      // +50ms so we land safely after the date flips.
      midnightTimer = setTimeout(
        () => {
          tick();
          armMidnight();
        },
        msUntilNextMidnight(new Date()) + 50
      );
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        tick();
        clearTimeout(minuteTimer);
        clearTimeout(midnightTimer);
        armMinute();
        armMidnight();
      }
    };
    const interval = setInterval(tick, KIOSK_POLL_MS);
    armMinute();
    armMidnight();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(minuteTimer);
      clearTimeout(midnightTimer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return now;
}

export type KioskStatus = 'loading' | 'ready' | 'unauthorized';

/**
 * Polls the kiosk week every 60s, on visibility, and whenever the local date changes. Keeps the
 * last good data on transient failures; a 401 clears the stored key.
 */
export function useKioskWeek(
  key: string | null,
  today: string
): { week: KioskWeek | null; status: KioskStatus; stale: boolean } {
  const [week, setWeek] = useState<KioskWeek | null>(null);
  const [rejected, setRejected] = useState(false);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await fetchKioskWeek(key, today, controller.signal);
        if (controller.signal.aborted) return;
        setWeek(data);
        setStale(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof KioskAuthError) {
          clearStoredKioskKey();
          setRejected(true);
        } else {
          setStale(true);
        }
      } finally {
        inFlight = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    void load();
    const interval = setInterval(() => void load(), KIOSK_POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      controller.abort();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key, today]);

  const status: KioskStatus = rejected ? 'unauthorized' : week ? 'ready' : 'loading';
  return { week, status, stale };
}

/** Request a screen wake lock where supported; re-acquire when the page becomes visible again. */
export function useWakeLock(): void {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (sentinel && !sentinel.released) return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void next.release().catch(() => undefined);
          return;
        }
        sentinel = next;
      } catch {
        // Denied (e.g. low battery) or unsupported: the display just may dim.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, []);
}

/** True once there has been no pointer or key activity for 3 seconds. */
export function useIdleCursor(): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), CURSOR_HIDE_MS);
    };
    const events = ['mousemove', 'pointerdown', 'keydown', 'touchstart'] as const;
    arm();
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, arm));
    };
  }, []);

  return idle;
}

const LANDSCAPE_QUERY = '(orientation: landscape)';

/** Tracks the orientation media query; assumes landscape where matchMedia is unavailable. */
export function useIsLandscape(): boolean {
  const [landscape, setLandscape] = useState(() =>
    typeof window.matchMedia === 'function' ? window.matchMedia(LANDSCAPE_QUERY).matches : true
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(LANDSCAPE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setLandscape(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return landscape;
}
