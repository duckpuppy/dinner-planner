import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { acquireLive, subscribeLive, useLiveConnected } from '@/lib/liveEvents';
import { applyLiveEvent, eventBelongsTo, type LiveScope } from '@/lib/liveCache';

function subscribeVisibility(cb: () => void) {
  document.addEventListener('visibilitychange', cb);
  return () => document.removeEventListener('visibilitychange', cb);
}

const getVisible = () => document.visibilityState === 'visible';
const getServerVisible = () => true;

/**
 * Keep the cache live while the page is mounted and visible. All consumers share one stream
 * (ref-counted in lib/liveEvents); a hidden tab releases it and reconnects on visible, resuming
 * from the last event id. Returns whether the stream is currently connected, so callers can
 * slow their polling.
 */
export function useLiveEvents(scope: LiveScope): boolean {
  const qc = useQueryClient();
  const visible = useSyncExternalStore(subscribeVisibility, getVisible, getServerVisible);
  const connected = useLiveConnected();

  useEffect(() => {
    if (!visible) return;
    // Apply in arrival order even though applying may await a query cancel.
    let chain: Promise<void> = Promise.resolve();
    const unsubscribe = subscribeLive((event) => {
      if (!eventBelongsTo(scope, event.type)) return;
      chain = chain.then(() => applyLiveEvent(qc, event)).catch(() => undefined);
    });
    const release = acquireLive();
    return () => {
      unsubscribe();
      release();
    };
  }, [visible, qc, scope]);

  return visible && connected;
}
