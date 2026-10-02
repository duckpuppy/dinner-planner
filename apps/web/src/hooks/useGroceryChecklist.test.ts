import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { createElement } from 'react';

const { store, mockSetCheck, mockClearChecks } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  mockSetCheck: vi.fn(),
  mockClearChecks: vi.fn(),
}));

vi.mock('idb-keyval', () => ({
  get: (k: string) => Promise.resolve(store.get(k)),
  set: (k: string, v: unknown) => {
    store.set(k, structuredClone(v));
    return Promise.resolve();
  },
  del: (k: string) => {
    store.delete(k);
    return Promise.resolve();
  },
}));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  menus: { setGroceryCheck: mockSetCheck, clearGroceryChecks: mockClearChecks },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useGroceryChecklist, groceryItemKey } from './useGroceryChecklist';
import { queryClient } from '@/lib/queryClient';
import {
  restoreMutationQueue,
  startQueuePersistence,
  stopQueuePersistence,
} from '@/lib/mutationQueuePersistence';
import type { GroceriesData } from '@/lib/pendingOps';

const WEEK_DATE = '2024-06-10';
const OWNER = { userId: 'u1', familyId: 'f1' };

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeData(over: Partial<GroceriesData> = {}): GroceriesData {
  return {
    groceries: [],
    customItems: [],
    standingItems: [],
    weekStartDate: WEEK_DATE,
    checkedKeys: [],
    checks: [],
    ...over,
  };
}

function ack(v: { itemKey: string; checked: boolean; clientUpdatedAt: number }) {
  return Promise.resolve({
    itemKey: v.itemKey,
    checked: v.checked,
    updatedAt: v.clientUpdatedAt,
    checkedBy: null,
    changed: true,
  });
}

beforeEach(() => {
  store.clear();
  queryClient.clear();
  vi.clearAllMocks();
  onlineManager.setOnline(true);
  mockSetCheck.mockImplementation(ack);
  mockClearChecks.mockResolvedValue({ cleared: 0 });
});

afterEach(() => {
  stopQueuePersistence();
  vi.useRealTimers();
  onlineManager.setOnline(true);
});

describe('groceryItemKey', () => {
  it('produces lowercase name::unit key', () => {
    expect(groceryItemKey('Flour', 'G')).toBe('flour::g');
  });

  it('handles null unit', () => {
    expect(groceryItemKey('Salt', null)).toBe('salt::');
  });
});

describe('useGroceryChecklist', () => {
  it('exposes the checked set derived from server data', () => {
    const { result } = renderHook(
      () => useGroceryChecklist({ data: makeData({ checkedKeys: ['flour::g', 'salt::'] }) }),
      { wrapper }
    );
    expect(result.current.checked.has('flour::g')).toBe(true);
    expect(result.current.checked.has('salt::')).toBe(true);
  });

  it('is empty before the first load', () => {
    const { result } = renderHook(() => useGroceryChecklist({ data: undefined }), { wrapper });
    expect(result.current.view).toBeUndefined();
    expect(result.current.checked.size).toBe(0);
  });

  it('toggle and clearAll do nothing before the week is known', () => {
    onlineManager.setOnline(false);
    const { result } = renderHook(() => useGroceryChecklist({ data: undefined }), { wrapper });
    act(() => {
      result.current.toggle('flour::g', 'Flour');
      result.current.clearAll();
    });
    expect(queryClient.isMutating({ mutationKey: ['offline'] })).toBe(0);
  });

  it('toggle sends a PUT with checked = !current and a client timestamp', async () => {
    const before = Date.now();
    const { result } = renderHook(() => useGroceryChecklist({ data: makeData() }), { wrapper });
    act(() => result.current.toggle('flour::g', 'Flour'));
    await vi.waitFor(() => expect(mockSetCheck).toHaveBeenCalledTimes(1));
    const arg = mockSetCheck.mock.calls[0][0];
    expect(arg).toMatchObject({
      weekDate: WEEK_DATE,
      itemKey: 'flour::g',
      itemName: 'Flour',
      checked: true,
    });
    expect(arg.clientUpdatedAt).toBeGreaterThanOrEqual(before);
  });

  it('toggle on a checked item unchecks it', async () => {
    const { result } = renderHook(
      () => useGroceryChecklist({ data: makeData({ checkedKeys: ['flour::g'] }) }),
      { wrapper }
    );
    act(() => result.current.toggle('flour::g', 'Flour'));
    await vi.waitFor(() => expect(mockSetCheck).toHaveBeenCalled());
    expect(mockSetCheck.mock.calls[0][0]).toMatchObject({ checked: false });
  });

  it('clearAll sends a clear with a client timestamp', async () => {
    const { result } = renderHook(
      () => useGroceryChecklist({ data: makeData({ checkedKeys: ['a'] }) }),
      { wrapper }
    );
    act(() => result.current.clearAll());
    await vi.waitFor(() =>
      expect(mockClearChecks).toHaveBeenCalledWith({
        weekDate: WEEK_DATE,
        clientUpdatedAt: expect.any(Number),
      })
    );
  });

  it('while offline the toggle shows immediately, marked pending, with no request sent', async () => {
    onlineManager.setOnline(false);
    const { result } = renderHook(() => useGroceryChecklist({ data: makeData() }), { wrapper });

    act(() => result.current.toggle('flour::g', 'Flour'));

    await vi.waitFor(() => expect(result.current.checked.has('flour::g')).toBe(true));
    expect(result.current.pendingKeys.has('flour::g')).toBe(true);
    expect(mockSetCheck).not.toHaveBeenCalled();

    // Toggling again flips the effective state, queued behind the first.
    act(() => result.current.toggle('flour::g', 'Flour'));
    await vi.waitFor(() => expect(result.current.checked.has('flour::g')).toBe(false));
    expect(queryClient.isMutating({ mutationKey: ['offline'] })).toBe(2);
  });

  it('keeps showing the pending change across a refetch of the server data', async () => {
    onlineManager.setOnline(false);
    let data = makeData();
    const { result, rerender } = renderHook(() => useGroceryChecklist({ data }), { wrapper });
    act(() => result.current.toggle('flour::g', 'Flour'));
    await vi.waitFor(() => expect(result.current.checked.has('flour::g')).toBe(true));

    data = makeData({ groceries: [] }); // a fresh server response that doesn't know the change
    rerender();
    expect(result.current.checked.has('flour::g')).toBe(true);
  });

  it('a newer change from another shopper wins over our older pending one', async () => {
    onlineManager.setOnline(false);
    let data = makeData();
    const { result, rerender } = renderHook(() => useGroceryChecklist({ data }), { wrapper });
    act(() => result.current.toggle('flour::g', 'Flour'));
    await vi.waitFor(() => expect(result.current.checked.has('flour::g')).toBe(true));

    data = makeData({
      checkedKeys: [],
      checks: [
        { itemKey: 'flour::g', checked: false, updatedAt: Date.now() + 60_000, checkedBy: null },
      ],
    });
    rerender();
    expect(result.current.checked.has('flour::g')).toBe(false);
  });

  it('survives a simulated restart: persisted, restored, still shown, then synced', async () => {
    vi.useFakeTimers();
    onlineManager.setOnline(false);
    startQueuePersistence(OWNER);
    const first = renderHook(() => useGroceryChecklist({ data: makeData() }), { wrapper });
    act(() => first.result.current.toggle('flour::g', 'Flour'));
    await vi.advanceTimersByTimeAsync(200);
    expect(store.has('dinner-planner-mutation-queue')).toBe(true);

    // "Restart": drop everything in memory, keep what is on disk.
    first.unmount();
    stopQueuePersistence();
    queryClient.clear();
    expect(queryClient.isMutating({ mutationKey: ['offline'] })).toBe(0);
    vi.useRealTimers();

    await restoreMutationQueue(OWNER);
    const second = renderHook(() => useGroceryChecklist({ data: makeData() }), { wrapper });
    expect(second.result.current.checked.has('flour::g')).toBe(true);
    expect(second.result.current.pendingKeys.has('flour::g')).toBe(true);
    expect(mockSetCheck).not.toHaveBeenCalled();

    // Back online: it replays and settles.
    await act(async () => {
      onlineManager.setOnline(true);
      await queryClient.resumePausedMutations();
    });
    await vi.waitFor(() =>
      expect(mockSetCheck).toHaveBeenCalledWith(
        expect.objectContaining({ itemKey: 'flour::g', checked: true })
      )
    );
    await vi.waitFor(() => expect(queryClient.isMutating({ mutationKey: ['offline'] })).toBe(0));
  });
});
