import { apiUrl } from '@/lib/apiOrigin';

export const KIOSK_KEY_STORAGE = 'dinner-planner-kiosk-key';
const KIOSK_TIMEOUT_MS = 15_000;

export type KioskEntryType = 'assembled' | 'fend_for_self' | 'dining_out' | 'custom' | 'leftovers';

export interface KioskEntry {
  date: string;
  /** null means no entry was planned for this day. */
  type: KioskEntryType | null;
  skipped: boolean;
  completed: boolean;
  customText: string | null;
  customSideText: string | null;
  restaurantName: string | null;
  restaurantNotes: string | null;
  mainDish: {
    id: string;
    name: string;
    prepTime: number | null;
    cookTime: number | null;
    photoUrl: string | null;
  } | null;
  sides: { id: string; name: string }[];
  prepTasks: { description: string; completed: boolean }[];
  leftoversSource: { date: string; dishName: string; photoUrl: string | null } | null;
}

export interface KioskWeek {
  weekStartDate: string;
  today: string;
  entries: KioskEntry[];
}

/** The display link was rejected (invalid or revoked). */
export class KioskAuthError extends Error {
  constructor() {
    super('Display link rejected');
    this.name = 'KioskAuthError';
  }
}

export function readStoredKioskKey(): string | null {
  try {
    return localStorage.getItem(KIOSK_KEY_STORAGE);
  } catch {
    return null;
  }
}

export function storeKioskKey(key: string): void {
  try {
    localStorage.setItem(KIOSK_KEY_STORAGE, key);
  } catch {
    // Storage unavailable: the key still works for this page load.
  }
}

export function clearStoredKioskKey(): void {
  try {
    localStorage.removeItem(KIOSK_KEY_STORAGE);
  } catch {
    // ignore
  }
}

/**
 * Resolve the display key. A `?key=` in the URL wins: it is persisted and stripped from the
 * address bar so it does not linger in history or screenshots. Idempotent, so safe to call twice.
 */
export function resolveKioskKey(): string | null {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('key');
  if (fromUrl) {
    storeKioskKey(fromUrl);
    url.searchParams.delete('key');
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`
    );
    return fromUrl;
  }
  return readStoredKioskKey();
}

/**
 * Fetch the kiosk week with the display key. Deliberately not request(): that helper attaches the
 * user's JWT (which the kiosk endpoint rejects) and runs the silent-refresh/logout machinery.
 */
export async function fetchKioskWeek(
  key: string,
  date: string,
  signal?: AbortSignal
): Promise<KioskWeek> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), KIOSK_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(apiUrl(`/api/kiosk/week?date=${encodeURIComponent(date)}`), {
      headers: { Authorization: `Bearer ${key}` },
      cache: 'no-store',
      credentials: 'omit',
      signal: timeout.signal,
    });
    if (res.status === 401) throw new KioskAuthError();
    if (!res.ok) throw new Error(`Kiosk request failed (${res.status})`);
    return (await res.json()) as KioskWeek;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
