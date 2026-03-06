import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

const POLL_INTERVAL_MS = 60_000;

export function useVersionCheck() {
  const instanceIdRef = useRef<string | null>(null);
  const toastShownRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled || toastShownRef.current) return;
      timeoutRef.current = setTimeout(check, POLL_INTERVAL_MS);
    };

    const check = async () => {
      if (cancelled) return;
      try {
        const res = await fetch('/health');
        if (!res.ok) return scheduleNext();
        const data = await res.json();
        const { instanceId } = data;
        if (!instanceId) return scheduleNext();

        if (instanceIdRef.current === null) {
          instanceIdRef.current = instanceId;
        } else if (instanceId !== instanceIdRef.current && !toastShownRef.current) {
          toastShownRef.current = true;
          toast.info('Update available', {
            description: 'A new version of the app has been deployed.',
            action: { label: 'Refresh', onClick: () => window.location.reload() },
            duration: Infinity,
          });
          return; // stop polling
        }
      } catch {
        // network errors are silent — don't disrupt the user
      }
      scheduleNext();
    };

    check();
    return () => {
      cancelled = true;
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);
}
