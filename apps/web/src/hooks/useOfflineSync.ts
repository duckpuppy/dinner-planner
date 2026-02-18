import { useEffect, useRef } from 'react';
import { useQueryClient, onlineManager } from '@tanstack/react-query';
import { useOnlineStatus } from './useOnlineStatus';
import { toast } from 'sonner';

/**
 * Syncs queued (paused) mutations and refetches stale queries when coming back online.
 * TanStack Query resumes paused mutations automatically when the network manager
 * reports online — this hook wires that up to the browser's online event.
 */
export function useOfflineSync() {
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const wasOffline = useRef(false);

  useEffect(() => {
    // Keep TanStack Query's online manager in sync with the browser
    onlineManager.setOnline(isOnline);

    if (!isOnline) {
      wasOffline.current = true;
      return;
    }

    // We just came back online
    if (wasOffline.current) {
      wasOffline.current = false;
      toast.success('Back online — syncing changes');

      // Refetch all active queries to get fresh data
      queryClient.invalidateQueries();
    }
  }, [isOnline, queryClient]);

  return { isOnline };
}
