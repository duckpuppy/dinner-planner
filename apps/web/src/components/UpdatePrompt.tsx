import { RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** How often long-lived tabs / installed PWAs ask the browser to re-fetch sw.js. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Ask the browser to check for a new service worker hourly and whenever the tab becomes
 * visible again. Returns a teardown function.
 */
function startUpdateChecks(registration: ServiceWorkerRegistration): () => void {
  const check = () => {
    // update() rejects when offline; that is expected and safe to ignore.
    registration.update().catch(() => undefined);
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') check();
  };

  const intervalId = setInterval(check, UPDATE_CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    clearInterval(intervalId);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

/**
 * Registers the service worker (registerType: 'prompt') and shows a non-blocking banner
 * when a new build is waiting. No-op where service workers are unavailable (e.g. some
 * Capacitor WebViews): the plugin only registers when `navigator.serviceWorker` exists.
 */
export function UpdatePrompt() {
  const teardownRef = useRef<(() => void) | null>(null);
  const unmountedRef = useRef(false);
  const [dismissed, setDismissed] = useState(false);

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration || unmountedRef.current || teardownRef.current) return;
      teardownRef.current = startUpdateChecks(registration);
    },
  });

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      teardownRef.current?.();
      teardownRef.current = null;
    };
  }, []);

  if (!needRefresh || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 bg-card border rounded-xl shadow-lg p-4 mb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 flex-shrink-0">
          <RefreshCw className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">A new version is available</p>
          <p className="text-xs text-muted-foreground mt-0.5 text-pretty">
            Reload to get the latest updates.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => void updateServiceWorker(true)}
              className="flex-1 px-3 py-2.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Reload
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 rounded-md p-2 -m-2focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Dismiss update notice"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
