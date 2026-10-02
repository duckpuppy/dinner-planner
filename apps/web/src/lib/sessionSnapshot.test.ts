import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();

vi.mock('idb-keyval', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
  del: (...args: unknown[]) => mockDel(...args),
}));

import {
  CONTACT_WRITE_THROTTLE_MS,
  SESSION_KEY,
  SESSION_MAX_AGE_MS,
  __resetSessionSnapshotForTests,
  clearSnapshot,
  getLastServerContactAt,
  isSnapshotFresh,
  readSnapshot,
  touchServerContact,
  writeSnapshot,
} from './sessionSnapshot';
import type { User } from './api';

const user = { id: 'u1', familyId: 'f1' } as User;

// Stand-in for idb: one stored value.
let stored: unknown;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  vi.clearAllMocks();
  __resetSessionSnapshotForTests();
  stored = undefined;
  mockGet.mockImplementation(async () => stored);
  mockSet.mockImplementation(async (_k: string, v: unknown) => {
    stored = v;
  });
  mockDel.mockImplementation(async () => {
    stored = undefined;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sessionSnapshot', () => {
  it('writes user and contact time, never tokens', async () => {
    await writeSnapshot(user);
    expect(mockSet).toHaveBeenCalledWith(SESSION_KEY, {
      schema: 1,
      user,
      lastServerContactAt: Date.now(),
    });
  });

  it('reads back a valid snapshot and rejects malformed ones', async () => {
    await writeSnapshot(user);
    expect((await readSnapshot())?.user).toEqual(user);
    stored = { schema: 2, user, lastServerContactAt: 1 };
    expect(await readSnapshot()).toBeNull();
    stored = 'junk';
    expect(await readSnapshot()).toBeNull();
    mockGet.mockRejectedValueOnce(new Error('idb'));
    expect(await readSnapshot()).toBeNull();
  });

  it('clears the snapshot', async () => {
    await writeSnapshot(user);
    await clearSnapshot();
    expect(mockDel).toHaveBeenCalledWith(SESSION_KEY);
    expect(await readSnapshot()).toBeNull();
  });

  it('judges freshness against 7 days', () => {
    const now = Date.now();
    expect(
      isSnapshotFresh({ schema: 1, user, lastServerContactAt: now - SESSION_MAX_AGE_MS })
    ).toBe(true);
    expect(
      isSnapshotFresh({ schema: 1, user, lastServerContactAt: now - SESSION_MAX_AGE_MS - 1 })
    ).toBe(false);
  });

  it('throttles contact writes to one per 5 minutes but always updates memory', async () => {
    await writeSnapshot(user);
    mockSet.mockClear();

    vi.advanceTimersByTime(60_000);
    touchServerContact();
    expect(getLastServerContactAt()).toBe(Date.now());
    vi.advanceTimersByTime(60_000);
    touchServerContact();
    await vi.runAllTimersAsync();
    expect(mockSet).not.toHaveBeenCalled();
    expect(getLastServerContactAt()).toBe(Date.now());

    vi.advanceTimersByTime(CONTACT_WRITE_THROTTLE_MS);
    touchServerContact();
    await vi.runAllTimersAsync();
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect((stored as { lastServerContactAt: number }).lastServerContactAt).toBe(Date.now());

    // Window restarts from that write.
    vi.advanceTimersByTime(60_000);
    touchServerContact();
    await vi.runAllTimersAsync();
    expect(mockSet).toHaveBeenCalledTimes(1);
  });

  it('does not create a snapshot while no session is active', async () => {
    touchServerContact();
    await vi.runAllTimersAsync();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('does not resurrect a snapshot cleared while a touch was in flight', async () => {
    await writeSnapshot(user);
    mockSet.mockClear();
    vi.advanceTimersByTime(CONTACT_WRITE_THROTTLE_MS);
    touchServerContact();
    await clearSnapshot();
    await vi.runAllTimersAsync();
    expect(mockSet).not.toHaveBeenCalled();
    expect(stored).toBeUndefined();
  });

  it('ignores idb errors on touch', async () => {
    await writeSnapshot(user);
    vi.advanceTimersByTime(CONTACT_WRITE_THROTTLE_MS);
    mockGet.mockRejectedValueOnce(new Error('idb'));
    touchServerContact();
    await expect(vi.runAllTimersAsync()).resolves.toBeDefined();
  });
});
