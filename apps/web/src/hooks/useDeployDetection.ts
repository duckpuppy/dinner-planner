import { fetchHealth } from '@/lib/api';
import { useEffect, useRef } from 'react';

export const DEPLOY_POLL_INTERVAL_MS = 60_000;

/**
 * Polls /health for the server's `instanceId` and calls `onDeployDetected` whenever it
 * changes from the last seen value. This is only a fast hint: an instanceId also changes on
 * plain container restarts, so callers must verify (e.g. via the service worker) before
 * telling the user anything.
 *
 * Polling pauses while the document is hidden and checks immediately when it becomes
 * visible again. Network errors are silent.
 */
export function useDeployDetection(onDeployDetected: () => void, enabled = true) {
  const callbackRef = useRef(onDeployDetected);

  useEffect(() => {
    callbackRef.current = onDeployDetected;
  });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let baseline: string | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const scheduleNext = () => {
      clearTimer();
      if (cancelled || document.visibilityState === 'hidden') return;
      timeoutId = setTimeout(check, DEPLOY_POLL_INTERVAL_MS);
    };

    async function check() {
      timeoutId = null;
      if (cancelled) return;
      try {
        const res = await fetchHealth();
        if (res.ok) {
          const { instanceId } = await res.json();
          if (!cancelled && instanceId) {
            const changed = baseline !== null && instanceId !== baseline;
            baseline = instanceId;
            if (changed) callbackRef.current();
          }
        }
      } catch {
        // network errors are silent — don't disrupt the user
      }
      scheduleNext();
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        clearTimer();
        void check();
      } else {
        clearTimer();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    if (document.visibilityState !== 'hidden') void check();

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled]);
}
