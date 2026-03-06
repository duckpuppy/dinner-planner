import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

const POLL_INTERVAL_MS = 60_000;

export function useVersionCheck() {
  const bootIdRef = useRef<string | null>(null);
  const toastShownRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/health');
        if (!res.ok) return;
        const data = await res.json();
        const { bootId } = data;
        if (!bootId) return;

        if (bootIdRef.current === null) {
          bootIdRef.current = bootId;
        } else if (bootId !== bootIdRef.current && !toastShownRef.current) {
          toastShownRef.current = true;
          if (intervalRef.current !== null) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          toast.info('Update available', {
            description: 'A new version of the app has been deployed.',
            action: { label: 'Refresh', onClick: () => window.location.reload() },
            duration: Infinity,
          });
        }
      } catch {
        // network errors are silent — don't disrupt the user
      }
    };

    check();
    intervalRef.current = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);
}
