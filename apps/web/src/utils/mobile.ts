/**
 * Mobile UX utilities for device detection, motion preferences, and touch targets
 */

/** Minimum touch target size in pixels (WCAG 2.5.5) */
export const TOUCH_TARGET_MIN = 44;

/**
 * Detects if the current device is a mobile device with touch support
 */
export function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && 'ontouchstart' in window;
}

/**
 * Checks if the user prefers reduced motion
 */
export function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== 'function') {
    return false; // Assume no preference if matchMedia not supported
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Gets the CSS safe area inset values for notched devices
 */
export function getSafeAreaInsets() {
  const style = getComputedStyle(document.documentElement);
  return {
    top: style.getPropertyValue('--sat') || '0px',
    bottom: style.getPropertyValue('--sab') || '0px',
    left: style.getPropertyValue('--sal') || '0px',
    right: style.getPropertyValue('--sar') || '0px',
  };
}
