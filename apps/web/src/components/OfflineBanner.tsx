import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { WifiOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { usePendingSyncCount, useFailedSyncCount, retryFailed } from '@/lib/syncStatus';
import { cn } from '@/lib/utils';

// The banner lives in normal flow (inside Layout's safe-area-padded shell) so it takes real
// space and never covers page content. Layout already pads for the top safe-area inset.
const BASE = 'px-4 py-2 flex items-center gap-2 text-sm font-medium';

/** CSS variable holding the banner's current height; fixed elements (sidebar) offset by it. */
export const BANNER_HEIGHT_VAR = '--banner-h';

function changes(n: number) {
  return `${n} change${n === 1 ? '' : 's'}`;
}

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const pending = usePendingSyncCount();
  const failed = useFailedSyncCount();

  const regionRef = useRef<HTMLDivElement>(null);

  // Publish the rendered height so the fixed sidebar can sit below the banner.
  useLayoutEffect(() => {
    const el = regionRef.current;
    const root = document.documentElement;
    if (!el) return;
    const publish = () => root.style.setProperty(BANNER_HEIGHT_VAR, `${el.offsetHeight}px`);
    publish();
    if (typeof ResizeObserver === 'undefined')
      return () => root.style.removeProperty(BANNER_HEIGHT_VAR);
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty(BANNER_HEIGHT_VAR);
    };
  }, []);

  let content: ReactNode = null;

  if (!isOnline) {
    content = (
      <div className={cn(BASE, 'bg-yellow-500 text-yellow-950')}>
        <WifiOff className="size-4 shrink-0" aria-hidden="true" />
        <span>You&apos;re offline — changes will sync when you&apos;re back online</span>
      </div>
    );
  } else if (failed > 0) {
    content = (
      <div className={cn(BASE, 'bg-red-700 text-white')}>
        <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
        <span className="tabular-nums">{changes(failed)} failed to sync</span>
        <button
          type="button"
          onClick={retryFailed}
          className="ml-auto min-h-11 min-w-11 rounded px-3 underline hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Retry
        </button>
      </div>
    );
  } else if (pending > 0) {
    content = (
      <div className={cn(BASE, 'bg-blue-700 text-white')}>
        <RefreshCw className="size-4 shrink-0" aria-hidden="true" />
        <span className="tabular-nums">Syncing {changes(pending)}…</span>
      </div>
    );
  }

  // Keep the live region mounted so state changes are announced.
  return (
    <div
      ref={regionRef}
      role="status"
      aria-live="polite"
      className="sticky top-[var(--sat,0px)] z-50"
    >
      {content}
    </div>
  );
}
