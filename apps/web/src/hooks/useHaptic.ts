import { useRef } from 'react';

/**
 * Hook for providing haptic feedback on supported devices
 * Uses the Vibration API with progressive enhancement
 * Throttles feedback to max 1 per 100ms to prevent excessive vibration
 */

interface HapticFeedback {
  tap: () => void;
  success: () => void;
  error: () => void;
}

const THROTTLE_MS = 100;

export function useHaptic(): { haptic: HapticFeedback } {
  const lastTapTime = useRef(0);
  const lastSuccessTime = useRef(0);
  const lastErrorTime = useRef(0);

  const throttle = (lastTimeRef: React.MutableRefObject<number>, vibration: number | number[]) => {
    const now = Date.now();
    if (now - lastTimeRef.current >= THROTTLE_MS) {
      lastTimeRef.current = now;
      if (navigator.vibrate) {
        navigator.vibrate(vibration);
      }
    }
  };

  const haptic: HapticFeedback = {
    /**
     * Light tap feedback (10ms)
     * For button presses and quick interactions
     */
    tap: () => throttle(lastTapTime, 10),

    /**
     * Success feedback (double pulse: 20ms, pause 10ms, 20ms)
     * For successful actions like saving or completing
     */
    success: () => throttle(lastSuccessTime, [20, 10, 20]),

    /**
     * Error feedback (50ms)
     * For errors or failed actions
     */
    error: () => throttle(lastErrorTime, 50),
  };

  return { haptic };
}
