import { Capacitor } from '@capacitor/core';

/**
 * Origin of the API server. Empty on web (same-origin); on the native app the WebView is served
 * from https://localhost so every request must be sent to the configured remote origin.
 * Evaluated lazily (not at import) so tests can flip the platform.
 */
export function getApiOrigin(): string {
  if (!Capacitor.isNativePlatform()) return '';
  return (import.meta.env.VITE_API_ORIGIN ?? '').trim().replace(/\/+$/, '');
}

/** True when this is a native build that was compiled without a server to talk to. */
export function isMissingNativeOrigin(): boolean {
  return Capacitor.isNativePlatform() && getApiOrigin() === '';
}

/** Prefix an API/health path (e.g. `/api/dishes`) with the API origin. */
export function apiUrl(path: string): string {
  return `${getApiOrigin()}${path}`;
}

const ABSOLUTE_URL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** Resolve a media path (`/uploads/..`, `/videos/..`) against the API origin. Absolute URLs pass through. */
export function mediaUrl(path: string): string {
  if (ABSOLUTE_URL.test(path)) return path;
  return `${getApiOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
}
