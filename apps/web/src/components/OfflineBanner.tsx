import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500/90 text-yellow-950 px-4 py-2 flex items-center gap-2 text-sm font-medium backdrop-blur-sm">
      <WifiOff className="h-4 w-4 flex-shrink-0" />
      <span>You&apos;re offline — showing cached data</span>
    </div>
  );
}
