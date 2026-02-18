import { Download, X } from 'lucide-react';
import { useState } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export function InstallPrompt() {
  const { canInstall, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);

  if (!canInstall || dismissed) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-40 bg-card border rounded-xl shadow-lg p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 flex-shrink-0">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">Install Dinner Planner</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add to your home screen for quick access and offline use
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => install()}
              className="flex-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              Install
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="px-3 py-1.5 text-muted-foreground rounded-md text-xs hover:bg-secondary transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
