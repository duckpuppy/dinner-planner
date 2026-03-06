import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

const POLL_INTERVAL_MS = 60_000;

export function useVersionCheck() {
  const bootIdRef = useRef<string | null>(null);
  const toastShownRef = useRef(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) return;
        const data = await res.json();
        const { bootId } = data;
        if (!bootId) return;

        if (bootIdRef.current === null) {
          bootIdRef.current = bootId;
        } else if (bootId !== bootIdRef.current && !toastShownRef.current) {
          toastShownRef.current = true;
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
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);
}
