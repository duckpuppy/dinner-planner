import { del, get, set } from 'idb-keyval';
import type { User } from './api';

/**
 * Durable record of the last authenticated session, used to cold-start offline. It holds the
 * user profile and the last time the server answered, never tokens. It is deliberately NOT tied
 * to the app version: an update must not sign the user out.
 */
export const SESSION_KEY = 'dinner-planner-session';
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const CONTACT_WRITE_THROTTLE_MS = 5 * 60 * 1000;

export interface SessionSnapshot {
  schema: 1;
  user: User;
  lastServerContactAt: number;
}

// In-memory truth for "when did the server last answer"; idb is only written at most every
// CONTACT_WRITE_THROTTLE_MS.
let lastContactAt = Date.now();
let lastPersistAt = 0;
// True while a session exists, so stray successful requests (e.g. the login page's health
// probes) never create a snapshot.
let active = false;
// Bumped by clear/write so an in-flight touch cannot resurrect a cleared snapshot.
let epoch = 0;

function isSnapshot(value: unknown): value is SessionSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<SessionSnapshot>;
  return (
    v.schema === 1 &&
    typeof v.lastServerContactAt === 'number' &&
    typeof v.user === 'object' &&
    v.user !== null &&
    typeof v.user.id === 'string' &&
    typeof v.user.familyId === 'string'
  );
}

export async function readSnapshot(): Promise<SessionSnapshot | null> {
  try {
    const stored = await get<unknown>(SESSION_KEY);
    if (!isSnapshot(stored)) return null;
    active = true;
    lastContactAt = Math.max(lastContactAt, stored.lastServerContactAt);
    return stored;
  } catch {
    return null;
  }
}

export function isSnapshotFresh(snapshot: SessionSnapshot, now = Date.now()): boolean {
  return now - snapshot.lastServerContactAt <= SESSION_MAX_AGE_MS;
}

/** Store the user with "server contacted now". Call on login and every refresh success. */
export async function writeSnapshot(user: User): Promise<void> {
  epoch++;
  active = true;
  lastContactAt = Date.now();
  lastPersistAt = lastContactAt;
  const snapshot: SessionSnapshot = { schema: 1, user, lastServerContactAt: lastContactAt };
  try {
    await set(SESSION_KEY, snapshot);
  } catch {
    // Ignore persistence errors
  }
}

export async function clearSnapshot(): Promise<void> {
  epoch++;
  active = false;
  try {
    await del(SESSION_KEY);
  } catch {
    // Ignore
  }
}

/** Record that the server just answered. Memory always; idb at most once per throttle window. */
export function touchServerContact(now = Date.now()): void {
  lastContactAt = now;
  if (!active || now - lastPersistAt < CONTACT_WRITE_THROTTLE_MS) return;
  lastPersistAt = now;
  const myEpoch = epoch;
  void (async () => {
    try {
      const stored = await get<unknown>(SESSION_KEY);
      if (myEpoch !== epoch || !isSnapshot(stored)) return;
      await set(SESSION_KEY, { ...stored, lastServerContactAt: now });
    } catch {
      // Ignore persistence errors
    }
  })();
}

export function getLastServerContactAt(): number {
  return lastContactAt;
}

/** Test helper. */
export function __resetSessionSnapshotForTests() {
  epoch++;
  active = false;
  lastContactAt = Date.now();
  lastPersistAt = 0;
}
