import { ReactNode } from 'react';
import PullToRefreshLib from 'react-simple-pull-to-refresh';
import { isMobileDevice, prefersReducedMotion } from '@/utils/mobile';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

/**
 * Mobile pull-to-refresh wrapper
 * Disabled on desktop and when user prefers reduced motion
 */
export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const isDisabled = !isMobileDevice() || prefersReducedMotion();

  if (isDisabled) {
    return <>{children}</>;
  }

  return (
    <PullToRefreshLib onRefresh={onRefresh}>
      <>{children}</>
    </PullToRefreshLib>
  );
}
