import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { GroceriesData } from '@/lib/pendingOps';
import type { LiveEvent, LiveListener } from '@/lib/liveEvents';

const release = vi.fn();
const acquire = vi.fn(() => release);
let listeners: Set<LiveListener>;

vi.mock('@/lib/liveEvents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/liveEvents')>()),
  acquireLive: () => acquire(),
  subscribeLive: (l: LiveListener) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
}));

import { useLiveStore } from '@/lib/liveEvents';
import { useLiveEvents } from './useLiveEvents';

const WEEK = '2024-06-10';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

const emit = (e: LiveEvent) => listeners.forEach((l) => l(e));
const settle = () => act(async () => {});

describe('useLiveEvents', () => {
  let qc: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    qc = new QueryClient();
    qc.setQueryData(['groceries', WEEK], {
      groceries: [],
      customItems: [],
      standingItems: [],
      weekStartDate: WEEK,
      checkedKeys: [],
      checks: [],
    } satisfies GroceriesData);
    qc.setQueryData(['pantry'], { items: [] });
    listeners = new Set();
    acquire.mockClear();
    release.mockClear();
    setVisibility('visible');
    useLiveStore.setState({ connected: false });
  });

  afterEach(() => {
    cleanup();
    useLiveStore.setState({ connected: false });
  });

  it('acquires the stream on mount and releases on unmount', () => {
    const { unmount } = renderHook(() => useLiveEvents('grocery'), { wrapper });
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(1);
    unmount();
    expect(release).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  });

  it('releases when hidden and reacquires when visible again', () => {
    renderHook(() => useLiveEvents('grocery'), { wrapper });
    act(() => setVisibility('hidden'));
    expect(release).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
    act(() => setVisibility('visible'));
    expect(acquire).toHaveBeenCalledTimes(2);
    expect(listeners.size).toBe(1);
  });

  it('does not acquire when mounted while hidden', () => {
    setVisibility('hidden');
    renderHook(() => useLiveEvents('grocery'), { wrapper });
    expect(acquire).not.toHaveBeenCalled();
  });

  it('applies grocery events for the grocery scope only', async () => {
    renderHook(() => useLiveEvents('grocery'), { wrapper });
    emit({
      type: 'grocery.check',
      data: { weekDate: WEEK, itemKey: 'a::', checked: true, updatedAt: 5, checkedBy: null },
    });
    emit({ type: 'pantry.add', data: { id: 'p1', ingredientName: 'Rice' } });
    await settle();
    expect(qc.getQueryData<GroceriesData>(['groceries', WEEK])!.checkedKeys).toEqual(['a::']);
    expect(qc.getQueryData<{ items: unknown[] }>(['pantry'])!.items).toHaveLength(0);
  });

  it('applies pantry events for the pantry scope', async () => {
    renderHook(() => useLiveEvents('pantry'), { wrapper });
    emit({ type: 'pantry.add', data: { id: 'p1', ingredientName: 'Rice' } });
    await settle();
    expect(qc.getQueryData<{ items: unknown[] }>(['pantry'])!.items).toHaveLength(1);
  });

  it('applies events in arrival order', async () => {
    renderHook(() => useLiveEvents('grocery'), { wrapper });
    const row = (checked: boolean, updatedAt: number) => ({
      type: 'grocery.check',
      data: { weekDate: WEEK, itemKey: 'a::', checked, updatedAt, checkedBy: null },
    });
    emit(row(true, 1));
    emit(row(false, 2));
    emit(row(true, 3));
    await settle();
    expect(qc.getQueryData<GroceriesData>(['groceries', WEEK])!.checkedKeys).toEqual(['a::']);
  });

  it('reset invalidates both caches', async () => {
    renderHook(() => useLiveEvents('pantry'), { wrapper });
    emit({ type: 'reset', data: undefined });
    await settle();
    expect(qc.getQueryState(['pantry'])!.isInvalidated).toBe(true);
    expect(qc.getQueryState(['groceries', WEEK])!.isInvalidated).toBe(true);
  });

  it('reports connected only while visible', () => {
    const { result } = renderHook(() => useLiveEvents('grocery'), { wrapper });
    expect(result.current).toBe(false);
    act(() => useLiveStore.setState({ connected: true }));
    expect(result.current).toBe(true);
    act(() => setVisibility('hidden'));
    expect(result.current).toBe(false);
  });
});
