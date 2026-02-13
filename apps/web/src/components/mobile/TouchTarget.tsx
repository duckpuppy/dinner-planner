import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TOUCH_TARGET_MIN } from '@/utils/mobile';

interface TouchTargetProps {
  children: ReactNode;
  className?: string;
}

/**
 * Wrapper component ensuring minimum 44x44px touch target size (WCAG 2.5.5)
 * Automatically adds padding to meet minimum size requirements
 * Removes 300ms tap delay with touch-action: manipulation
 */
export function TouchTarget({ children, className }: TouchTargetProps) {
  return (
    <div
      className={cn(
        // Ensure minimum touch target size
        'inline-flex items-center justify-center',
        // Remove 300ms delay on mobile
        'touch-manipulation',
        // Min dimensions
        `min-w-[${TOUCH_TARGET_MIN}px] min-h-[${TOUCH_TARGET_MIN}px]`,
        className
      )}
      style={{
        touchAction: 'manipulation',
        minWidth: `${TOUCH_TARGET_MIN}px`,
        minHeight: `${TOUCH_TARGET_MIN}px`,
      }}
    >
      {children}
    </div>
  );
}
