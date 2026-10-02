import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';

const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();

vi.mock('idb-keyval', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
  del: (...args: unknown[]) => mockDel(...args),
}));

import { queryClient } from './queryClient';
import {
  CACHE_KEY,
  CACHE_VERSION,
  bindCacheOwner,
  clearCache,
  __resetQueryPersistenceForTests,
} from './queryPersistence';

const OWNER_A = { userId: 'u1', familyId: 'f1' };
const OLD = Date.now() - 60 * 60 * 1000; // 1h ago: stale (staleTime is 5 min)

function persisted(overrides: Record<string, unknown> = {}) {
  return {
    cacheVersion: CACHE_VERSION,
    userId: 'u1',
    familyId: 'f1',
    timestamp: Date.now(),
    entries: { '["family"]': { data: { name: 'Old Family' }, updatedAt: OLD } },
    ...overrides,
  };
}

const fetcher = vi.fn();

function FamilyName() {
  const { data } = useQuery({
    queryKey: ['family'],
    queryFn: fetcher,
  });
  return <div data-testid="name">{(data as { name: string } | undefined)?.name ?? 'none'}</div>;
}

function renderFamily() {
  return render(
    <QueryClientProvider client={queryClient}>
      <FamilyName />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetQueryPersistenceForTests();
  queryClient.clear();
  mockGet.mockResolvedValue(undefined);
  mockSet.mockResolvedValue(undefined);
  mockDel.mockResolvedValue(undefined);
  fetcher.mockResolvedValue({ name: 'Fresh Family' });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('bindCacheOwner', () => {
  it('hydrates when owner and version match, showing data immediately then refetching', async () => {
    mockGet.mockResolvedValue(persisted());
    await bindCacheOwner(OWNER_A);

    expect(queryClient.getQueryData(['family'])).toEqual({ name: 'Old Family' });
    expect(mockDel).not.toHaveBeenCalled();

    renderFamily();
    expect(screen.getByTestId('name')).toHaveTextContent('Old Family');
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Fresh Family'));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('marks hydrated queries stale using the persisted updatedAt', async () => {
    mockGet.mockResolvedValue(persisted());
    await bindCacheOwner(OWNER_A);
    const state = queryClient.getQueryState(['family']);
    expect(state?.dataUpdatedAt).toBe(OLD);
  });

  it('discards the cache when userId differs and never renders the other owner data', async () => {
    mockGet.mockResolvedValue(persisted({ userId: 'someone-else' }));
    await bindCacheOwner(OWNER_A);

    expect(queryClient.getQueryData(['family'])).toBeUndefined();
    expect(mockDel).toHaveBeenCalledWith(CACHE_KEY);

    let resolveFetch: (v: unknown) => void = () => {};
    fetcher.mockReturnValue(new Promise((r) => (resolveFetch = r)));
    renderFamily();
    expect(screen.getByTestId('name')).toHaveTextContent('none');
    expect(screen.queryByText('Old Family')).not.toBeInTheDocument();
    resolveFetch({ name: 'Fresh Family' });
    await waitFor(() => expect(screen.getByTestId('name')).toHaveTextContent('Fresh Family'));
  });

  it('discards the cache when familyId differs', async () => {
    mockGet.mockResolvedValue(persisted({ familyId: 'other-family' }));
    await bindCacheOwner(OWNER_A);
    expect(queryClient.getQueryData(['family'])).toBeUndefined();
    expect(mockDel).toHaveBeenCalledWith(CACHE_KEY);
  });

  it('discards the cache on CACHE_VERSION mismatch', async () => {
    mockGet.mockResolvedValue(persisted({ cacheVersion: 'old-version' }));
    await bindCacheOwner(OWNER_A);
    expect(queryClient.getQueryData(['family'])).toBeUndefined();
    expect(mockDel).toHaveBeenCalledWith(CACHE_KEY);
  });

  const DAY = 24 * 60 * 60 * 1000;
  const snapshot = (lastServerContactAt: number, userId = 'u1') => ({
    schema: 1,
    user: { id: userId, familyId: 'f1' },
    lastServerContactAt,
  });
  // The cache payload and the session snapshot live under different idb keys.
  function stubIdb(cache: unknown, snap: unknown) {
    mockGet.mockImplementation(async (key: string) => (key === CACHE_KEY ? cache : snap));
  }

  it('discards a cache older than 7 days (no snapshot: save timestamp)', async () => {
    mockGet.mockResolvedValue(persisted({ timestamp: Date.now() - 8 * DAY }));
    await bindCacheOwner(OWNER_A);
    expect(queryClient.getQueryData(['family'])).toBeUndefined();
    expect(mockDel).toHaveBeenCalledWith(CACHE_KEY);
  });

  it('keeps a 3 day old cache', async () => {
    mockGet.mockResolvedValue(persisted({ timestamp: Date.now() - 3 * DAY }));
    await bindCacheOwner(OWNER_A);
    expect(queryClient.getQueryData(['family'])).toEqual({ name: 'Old Family' });
  });

  it('ages the cache by last server contact, not by the payload save time', async () => {
    // Payload re-saved a minute ago by offline writes, but the server was last seen 8 days ago.
    stubIdb(persisted({ timestamp: Date.now() - 60_000 }), snapshot(Date.now() - 8 * DAY));
    await bindCacheOwner(OWNER_A);
    expect(queryClient.getQueryData(['family'])).toBeUndefined();
    expect(mockDel).toHaveBeenCalledWith(CACHE_KEY);
  });

  it('uses the snapshot contact time when it is fresher than the save time', async () => {
    stubIdb(persisted({ timestamp: Date.now() - 8 * DAY }), snapshot(Date.now() - 60_000));
    await bindCacheOwner(OWNER_A);
    expect(queryClient.getQueryData(['family'])).toEqual({ name: 'Old Family' });
  });

  it("ignores another user's snapshot", async () => {
    stubIdb(persisted({ timestamp: Date.now() - 60_000 }), snapshot(Date.now() - 8 * DAY, 'u9'));
    await bindCacheOwner(OWNER_A);
    expect(queryClient.getQueryData(['family'])).toEqual({ name: 'Old Family' });
  });

  it('discards a legacy-format cache without owner metadata', async () => {
    mockGet.mockResolvedValue({ timestamp: Date.now(), data: { '["family"]': { name: 'Test' } } });
    await bindCacheOwner(OWNER_A);
    expect(queryClient.getQueryData(['family'])).toBeUndefined();
    expect(mockDel).toHaveBeenCalledWith(CACHE_KEY);
  });

  it('tolerates read failures and malformed entries', async () => {
    mockGet.mockRejectedValueOnce(new Error('idb broken'));
    await expect(bindCacheOwner(OWNER_A)).resolves.toBeUndefined();

    __resetQueryPersistenceForTests();
    mockGet.mockResolvedValue(
      persisted({
        entries: { 'not json': { data: 1, updatedAt: OLD }, '["ok"]': { data: 2, updatedAt: OLD } },
      })
    );
    await bindCacheOwner(OWNER_A);
    expect(queryClient.getQueryData(['ok'])).toBe(2);
  });

  it('is a no-op when re-bound to the same owner', async () => {
    await bindCacheOwner(OWNER_A);
    mockGet.mockClear();
    await bindCacheOwner(OWNER_A);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('resets queries and deletes persisted cache when the owner changes in-session', async () => {
    await bindCacheOwner(OWNER_A);
    queryClient.setQueryData(['family'], { name: 'Test' });
    const resetSpy = vi.spyOn(queryClient, 'resetQueries');
    await bindCacheOwner({ userId: 'u1', familyId: 'f2' });
    expect(resetSpy).toHaveBeenCalled();
    expect(queryClient.getQueryData(['family'])).toBeUndefined();
    expect(mockDel).toHaveBeenCalledWith(CACHE_KEY);
    resetSpy.mockRestore();
  });

  it('persists successful queries with owner metadata, per-query updatedAt, and version', async () => {
    vi.useFakeTimers();
    await bindCacheOwner(OWNER_A);
    queryClient.setQueryData(['dishes'], [{ id: 1 }]);
    await vi.advanceTimersByTimeAsync(1100);
    expect(mockSet).toHaveBeenCalledTimes(1);
    const [key, payload] = mockSet.mock.calls[0];
    expect(key).toBe(CACHE_KEY);
    expect(payload).toMatchObject({
      cacheVersion: CACHE_VERSION,
      userId: 'u1',
      familyId: 'f1',
      entries: { '["dishes"]': { data: [{ id: 1 }] } },
    });
    expect(typeof payload.entries['["dishes"]'].updatedAt).toBe('number');
  });

  it('ignores persistence write errors', async () => {
    vi.useFakeTimers();
    mockSet.mockRejectedValue(new Error('quota'));
    await bindCacheOwner(OWNER_A);
    queryClient.setQueryData(['dishes'], [1]);
    await vi.advanceTimersByTimeAsync(1100);
    expect(mockSet).toHaveBeenCalled();
  });
});

describe('clearCache (logout)', () => {
  it('clears in-memory and persisted cache', async () => {
    await bindCacheOwner(OWNER_A);
    queryClient.setQueryData(['family'], { name: 'Test' });
    await clearCache();
    expect(queryClient.getQueryData(['family'])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(mockDel).toHaveBeenCalledWith(CACHE_KEY);
  });

  it('does not re-persist after logout (pending save is cancelled)', async () => {
    vi.useFakeTimers();
    await bindCacheOwner(OWNER_A);
    queryClient.setQueryData(['family'], { name: 'Test' });
    await clearCache();
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('keeps the persisted cache when asked (network failure) but clears memory', async () => {
    await bindCacheOwner(OWNER_A);
    queryClient.setQueryData(['family'], { name: 'Test' });
    await clearCache({ keepPersisted: true });
    expect(queryClient.getQueryData(['family'])).toBeUndefined();
    expect(mockDel).not.toHaveBeenCalled();
  });

  it('ignores delete errors', async () => {
    mockDel.mockRejectedValue(new Error('nope'));
    await expect(clearCache()).resolves.toBeUndefined();
  });
});
