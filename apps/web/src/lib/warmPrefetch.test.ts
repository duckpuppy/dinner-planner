import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSettings, mockStores, mockPantry, mockGroceries } = vi.hoisted(() => ({
  mockSettings: vi.fn(),
  mockStores: vi.fn(),
  mockPantry: vi.fn(),
  mockGroceries: vi.fn(),
}));

vi.mock('./api', () => ({
  settings: { get: mockSettings },
  stores: { list: mockStores },
  pantry: { list: mockPantry },
  menus: { getGroceries: mockGroceries },
}));

import { queryClient } from './queryClient';
import { groceriesQueryKey } from './groceryQueryKey';
import { localDateStr } from './utils';
import { warmPrefetch } from './warmPrefetch';

beforeEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
});

describe('warmPrefetch', () => {
  it('prefetches the page query keys without blocking', async () => {
    mockSettings.mockResolvedValue({ settings: { weekStartDay: 1 } });
    mockStores.mockResolvedValue([]);
    mockPantry.mockResolvedValue({ items: [] });
    mockGroceries.mockResolvedValue({ groceries: [] });
    warmPrefetch();
    const today = localDateStr();
    // Same key the GroceryPage derives: ['groceries', <week start date>].
    const key = groceriesQueryKey(today, 1);
    await vi.waitFor(() => {
      expect(queryClient.getQueryData(['settings'])).toEqual({ settings: { weekStartDay: 1 } });
      expect(queryClient.getQueryData(['stores'])).toEqual([]);
      expect(queryClient.getQueryData(['pantry'])).toEqual({ items: [] });
      expect(queryClient.getQueryData(key)).toEqual({ groceries: [] });
    });
    expect(key[1]).not.toBeUndefined();
    expect(mockGroceries).toHaveBeenCalledWith(today);
  });

  it('falls back to the requested-date key when settings are unavailable', async () => {
    mockSettings.mockRejectedValue(new Error('offline'));
    mockStores.mockResolvedValue([]);
    mockPantry.mockResolvedValue({ items: [] });
    mockGroceries.mockResolvedValue({ groceries: [] });
    warmPrefetch();
    const today = localDateStr();
    // The failed settings prefetch retries once (1s) before the fallback key is used.
    await vi.waitFor(
      () => {
        expect(queryClient.getQueryData(['groceries', today])).toEqual({ groceries: [] });
      },
      { timeout: 5000 }
    );
  });

  it('swallows errors', async () => {
    mockSettings.mockRejectedValue(new Error('offline'));
    mockStores.mockRejectedValue(new Error('offline'));
    mockPantry.mockRejectedValue(new Error('offline'));
    mockGroceries.mockRejectedValue(new Error('offline'));
    expect(() => warmPrefetch()).not.toThrow();
    // Groceries wait for the (retrying) settings prefetch to settle first.
    await vi.waitFor(() => expect(mockGroceries).toHaveBeenCalled(), { timeout: 5000 });
  });
});
