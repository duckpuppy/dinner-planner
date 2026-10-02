import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onlineManager } from '@tanstack/react-query';

const { mockSetCheck, mockClear, mockAddCustom, mockDeleteCustom, mockPantryCreate, mockToast } =
  vi.hoisted(() => ({
    mockSetCheck: vi.fn(),
    mockClear: vi.fn(),
    mockAddCustom: vi.fn(),
    mockDeleteCustom: vi.fn(),
    mockPantryCreate: vi.fn(),
    mockToast: { error: vi.fn(), success: vi.fn() },
  }));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  menus: {
    setGroceryCheck: mockSetCheck,
    clearGroceryChecks: mockClear,
    addCustomItem: mockAddCustom,
    deleteCustomItem: mockDeleteCustom,
  },
  standing: { add: vi.fn(), delete: vi.fn() },
  pantry: { create: mockPantryCreate, delete: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: mockToast }));

import { ApiError, NetworkError } from './api';
import { queryClient } from './queryClient';
import {
  enqueue,
  mergeCheckRow,
  mergeClear,
  newClientId,
  nextClientTimestamp,
  offlineRetry,
  offlineRetryDelay,
} from './offlineMutations';
import { clearFailed, getFailed } from './failedSyncStore';
import { retryFailed } from './syncStatus';
import type { GroceriesData } from './pendingOps';

const WEEK = '2024-06-10';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function row(itemKey: string, checked = true) {
  return { itemKey, checked, updatedAt: Date.now(), checkedBy: null, changed: true };
}

function groceries(over: Partial<GroceriesData> = {}): GroceriesData {
  return {
    groceries: [],
    customItems: [],
    standingItems: [],
    weekStartDate: WEEK,
    checkedKeys: [],
    checks: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  clearFailed();
  onlineManager.setOnline(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  onlineManager.setOnline(true);
});

describe('offlineRetry', () => {
  it('retries network errors without limit', () => {
    expect(offlineRetry(0, new NetworkError('offline'))).toBe(true);
    expect(offlineRetry(500, new NetworkError('timeout'))).toBe(true);
  });

  it('retries 5xx and 429 three times, then gives up', () => {
    for (const status of [500, 503, 429]) {
      const err = new ApiError(status, 'x');
      expect([0, 1, 2, 3].map((n) => offlineRetry(n, err))).toEqual([true, true, true, false]);
    }
  });

  it('never retries other 4xx or unknown errors', () => {
    for (const status of [400, 401, 404, 409]) {
      expect(offlineRetry(0, new ApiError(status, 'x'))).toBe(false);
    }
    expect(offlineRetry(0, new Error('boom'))).toBe(false);
  });
});

describe('offlineRetryDelay', () => {
  it('backs off exponentially with jitter, capped at 30s', () => {
    for (let n = 0; n < 12; n++) {
      const step = Math.min(30_000, 1000 * 2 ** n);
      const d = offlineRetryDelay(n);
      expect(d).toBeGreaterThanOrEqual(Math.floor(step / 2));
      expect(d).toBeLessThanOrEqual(step);
    }
  });
});

describe('newClientId / nextClientTimestamp', () => {
  it('produces v4 uuids', () => {
    expect(newClientId()).toMatch(UUID_V4);
  });

  it('falls back to getRandomValues when randomUUID is missing (insecure context)', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (b: Uint8Array) => b.fill(7),
    });
    expect(newClientId()).toMatch(UUID_V4);
  });

  it('falls back to Math.random when crypto is missing entirely', () => {
    vi.stubGlobal('crypto', undefined);
    const a = newClientId();
    expect(a).toMatch(UUID_V4);
    expect(newClientId()).not.toBe(a);
  });

  it('timestamps strictly increase even within the same millisecond', () => {
    const t = [nextClientTimestamp(), nextClientTimestamp(), nextClientTimestamp()];
    expect(t[1]).toBeGreaterThan(t[0]);
    expect(t[2]).toBeGreaterThan(t[1]);
  });
});

describe('queue behaviour', () => {
  it('stays paused offline and replays serially in FIFO order on reconnect', async () => {
    const order: string[] = [];
    mockSetCheck.mockImplementation(async (v: { itemKey: string }) => {
      order.push(v.itemKey);
      return row(v.itemKey);
    });
    mockAddCustom.mockImplementation(async (_w: string, v: { id: string }) => {
      order.push(`add:${v.id}`);
      return { id: v.id };
    });

    onlineManager.setOnline(false);
    void enqueue('checkSet', {
      weekDate: WEEK,
      itemKey: 'a',
      itemName: 'A',
      checked: true,
      clientUpdatedAt: 1,
    });
    void enqueue('customAdd', { id: 'c1', weekDate: WEEK, name: 'Towels' });
    void enqueue('checkSet', {
      weekDate: WEEK,
      itemKey: 'b',
      itemName: 'B',
      checked: false,
      clientUpdatedAt: 2,
    });

    await Promise.resolve();
    expect(mockSetCheck).not.toHaveBeenCalled();
    expect(queryClient.isMutating({ mutationKey: ['offline'] })).toBe(3);

    onlineManager.setOnline(true);
    await queryClient.resumePausedMutations();
    await vi.waitFor(() => expect(order).toEqual(['a', 'add:c1', 'b']));
    await vi.waitFor(() => expect(queryClient.isMutating({ mutationKey: ['offline'] })).toBe(0));
  });

  it('keeps a client-generated create id stable across a retried replay', async () => {
    mockAddCustom
      .mockRejectedValueOnce(new NetworkError('offline'))
      .mockResolvedValue({ id: 'same-id' });
    vi.useFakeTimers();

    void enqueue('customAdd', { id: 'same-id', weekDate: WEEK, name: 'Towels' });
    await vi.advanceTimersByTimeAsync(31_000);

    expect(mockAddCustom).toHaveBeenCalledTimes(2);
    const ids = mockAddCustom.mock.calls.map((c) => (c[1] as { id: string }).id);
    expect(ids).toEqual(['same-id', 'same-id']);
  });

  it('retries a network failure until it succeeds, without recording a failure', async () => {
    mockSetCheck
      .mockRejectedValueOnce(new NetworkError('timeout'))
      .mockRejectedValueOnce(new NetworkError('offline'))
      .mockResolvedValue(row('a'));
    vi.useFakeTimers();

    void enqueue('checkSet', {
      weekDate: WEEK,
      itemKey: 'a',
      itemName: 'A',
      checked: true,
      clientUpdatedAt: 1,
    });
    await vi.advanceTimersByTimeAsync(100_000);

    expect(mockSetCheck).toHaveBeenCalledTimes(3);
    expect(getFailed()).toHaveLength(0);
    expect(queryClient.isMutating({ mutationKey: ['offline'] })).toBe(0);
  });

  it('retries a 5xx three times, then drops it into the failed store with a toast', async () => {
    mockSetCheck.mockRejectedValue(new ApiError(503, 'Unavailable'));
    vi.useFakeTimers();

    void enqueue('checkSet', {
      weekDate: WEEK,
      itemKey: 'a',
      itemName: 'A',
      checked: true,
      clientUpdatedAt: 1,
    });
    await vi.advanceTimersByTimeAsync(200_000);

    expect(mockSetCheck).toHaveBeenCalledTimes(4); // first try + 3 retries
    expect(getFailed()).toHaveLength(1);
    expect(getFailed()[0]).toMatchObject({
      key: ['offline', 'grocery', 'check', 'set'],
      message: 'Unavailable',
    });
    expect(mockToast.error).toHaveBeenCalledTimes(1);
    expect(queryClient.isMutating({ mutationKey: ['offline'] })).toBe(0);
  });

  it('drops a 4xx immediately and lets the next queued change proceed', async () => {
    mockSetCheck.mockImplementation(async (v: { itemKey: string }) => {
      if (v.itemKey === 'bad') throw new ApiError(400, 'Validation error');
      return row(v.itemKey);
    });

    onlineManager.setOnline(false);
    void enqueue('checkSet', {
      weekDate: WEEK,
      itemKey: 'bad',
      itemName: 'Bad',
      checked: true,
      clientUpdatedAt: 1,
    });
    void enqueue('checkSet', {
      weekDate: WEEK,
      itemKey: 'good',
      itemName: 'Good',
      checked: true,
      clientUpdatedAt: 2,
    });
    onlineManager.setOnline(true);
    await queryClient.resumePausedMutations();

    await vi.waitFor(() => expect(mockSetCheck).toHaveBeenCalledTimes(2));
    expect(mockSetCheck.mock.calls.map((c) => (c[0] as { itemKey: string }).itemKey)).toEqual([
      'bad',
      'good',
    ]);
    await vi.waitFor(() => expect(queryClient.isMutating({ mutationKey: ['offline'] })).toBe(0));
    expect(getFailed()).toHaveLength(1);
    expect(mockToast.error).toHaveBeenCalledTimes(1);
  });

  it('retryFailed re-enqueues the dropped changes', async () => {
    mockSetCheck.mockRejectedValueOnce(new ApiError(400, 'nope')).mockResolvedValue(row('a'));

    await enqueue('checkSet', {
      weekDate: WEEK,
      itemKey: 'a',
      itemName: 'A',
      checked: true,
      clientUpdatedAt: 1,
    });
    expect(getFailed()).toHaveLength(1);

    retryFailed();
    expect(getFailed()).toHaveLength(0);
    await vi.waitFor(() => expect(mockSetCheck).toHaveBeenCalledTimes(2));
    expect(mockSetCheck.mock.calls[1][0]).toMatchObject({ itemKey: 'a', clientUpdatedAt: 1 });
  });

  it('merges the server row into the cache and invalidates once, after the last change', async () => {
    queryClient.setQueryData(['groceries', WEEK], groceries());
    mockSetCheck.mockImplementation(async (v: { itemKey: string; checked: boolean }) => ({
      itemKey: v.itemKey,
      checked: v.checked,
      updatedAt: 500,
      checkedBy: { id: 'u2', displayName: 'Sam' },
      changed: true,
    }));
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    onlineManager.setOnline(false);
    void enqueue('checkSet', {
      weekDate: WEEK,
      itemKey: 'a',
      itemName: 'A',
      checked: true,
      clientUpdatedAt: 400,
    });
    void enqueue('checkSet', {
      weekDate: WEEK,
      itemKey: 'b',
      itemName: 'B',
      checked: true,
      clientUpdatedAt: 401,
    });
    onlineManager.setOnline(true);
    await queryClient.resumePausedMutations();
    await vi.waitFor(() => expect(queryClient.isMutating({ mutationKey: ['offline'] })).toBe(0));

    const data = queryClient.getQueryData<GroceriesData>(['groceries', WEEK]);
    expect(data?.checkedKeys.sort()).toEqual(['a', 'b']);
    expect(data?.checks?.find((c) => c.itemKey === 'a')?.checkedBy?.displayName).toBe('Sam');
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['groceries'] });
  });
});

describe('cache merge helpers', () => {
  it('mergeCheckRow ignores a row older than what is cached', () => {
    const d = groceries({
      checkedKeys: ['a'],
      checks: [{ itemKey: 'a', checked: true, updatedAt: 900, checkedBy: null }],
    });
    const merged = mergeCheckRow(d, {
      itemKey: 'a',
      checked: false,
      updatedAt: 100,
      checkedBy: null,
    });
    expect(merged.checkedKeys).toEqual(['a']);
  });

  it('mergeCheckRow treats legacy checkedKeys as written at time 0', () => {
    const d = groceries({ checkedKeys: ['a'], checks: undefined });
    const merged = mergeCheckRow(d, {
      itemKey: 'a',
      checked: false,
      updatedAt: 5,
      checkedBy: null,
    });
    expect(merged.checkedKeys).toEqual([]);
  });

  it('mergeClear unchecks only items last written before the clear', () => {
    const d = groceries({
      checkedKeys: ['old', 'new'],
      checks: [
        { itemKey: 'old', checked: true, updatedAt: 100, checkedBy: null },
        { itemKey: 'new', checked: true, updatedAt: 900, checkedBy: null },
      ],
    });
    expect(mergeClear(d, 500).checkedKeys).toEqual(['new']);
  });
});
