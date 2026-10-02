import type { ReactNode } from 'react';
import { WifiOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { usePendingSyncCount, useFailedSyncCount, retryFailed } from '@/lib/syncStatus';
import { cn } from '@/lib/utils';

const BASE =
  'fixed top-0 left-0 right-0 z-50 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] flex items-center gap-2 text-sm font-medium';

function changes(n: number) {
  return `${n} change${n === 1 ? '' : 's'}`;
}

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const pending = usePendingSyncCount();
  const failed = useFailedSyncCount();

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
          className="ml-auto min-h-11 min-w-11 rounded px-3 underline hover:bg-white/20focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
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
    <div role="status" aria-live="polite">
      {content}
    </div>
  );
}
