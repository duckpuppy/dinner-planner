/**
 * Hook for providing haptic feedback on supported devices
 * Uses the Vibration API with progressive enhancement
 */

interface HapticFeedback {
  tap: () => void;
  success: () => void;
  error: () => void;
}

export function useHaptic(): { haptic: HapticFeedback } {
  const haptic: HapticFeedback = {
    /**
     * Light tap feedback (10ms)
     * For button presses and quick interactions
     */
    tap: () => {
      if (navigator.vibrate) {
        navigator.vibrate(10);
      }
    },

    /**
     * Success feedback (double pulse: 20ms, pause 10ms, 20ms)
     * For successful actions like saving or completing
     */
    success: () => {
      if (navigator.vibrate) {
        navigator.vibrate([20, 10, 20]);
      }
    },

    /**
     * Error feedback (50ms)
     * For errors or failed actions
     */
    error: () => {
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    },
  };

  return { haptic };
}
