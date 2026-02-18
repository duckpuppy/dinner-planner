import { useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Hook for providing haptic feedback on supported devices.
 * Uses @capacitor/haptics on native Android for precise haptic patterns,
 * with Vibration API fallback for web/PWA.
 * Throttles feedback to max 1 per 100ms to prevent excessive vibration.
 */

interface HapticFeedback {
  tap: () => void;
  success: () => void;
  error: () => void;
}

const THROTTLE_MS = 100;
const isNative = Capacitor.isNativePlatform();

export function useHaptic(): { haptic: HapticFeedback } {
  const lastTapTime = useRef(0);
  const lastSuccessTime = useRef(0);
  const lastErrorTime = useRef(0);

  const throttle = (
    lastTimeRef: React.MutableRefObject<number>,
    nativeFn: () => Promise<void>,
    webVibration: number | number[]
  ) => {
    const now = Date.now();
    if (now - lastTimeRef.current < THROTTLE_MS) return;
    lastTimeRef.current = now;

    if (isNative) {
      nativeFn().catch(() => {
        // Ignore haptic errors (device may not support it)
      });
    } else if (navigator.vibrate) {
      navigator.vibrate(webVibration);
    }
  };

  const haptic: HapticFeedback = {
    tap: () => throttle(lastTapTime, () => Haptics.impact({ style: ImpactStyle.Light }), 10),

    success: () =>
      throttle(
        lastSuccessTime,
        () => Haptics.notification({ type: NotificationType.Success }),
        [20, 10, 20]
      ),

    error: () =>
      throttle(lastErrorTime, () => Haptics.notification({ type: NotificationType.Error }), 50),
  };

  return { haptic };
}
