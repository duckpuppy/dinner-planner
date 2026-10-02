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
import { localDateStr } from './utils';
import { warmPrefetch } from './warmPrefetch';

beforeEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
});

describe('warmPrefetch', () => {
  it('prefetches the page query keys without blocking', async () => {
    mockSettings.mockResolvedValue({ settings: {} });
    mockStores.mockResolvedValue([]);
    mockPantry.mockResolvedValue({ items: [] });
    mockGroceries.mockResolvedValue({ groceries: [] });
    warmPrefetch();
    const today = localDateStr();
    await vi.waitFor(() => {
      expect(queryClient.getQueryData(['settings'])).toEqual({ settings: {} });
      expect(queryClient.getQueryData(['stores'])).toEqual([]);
      expect(queryClient.getQueryData(['pantry'])).toEqual({ items: [] });
      expect(queryClient.getQueryData(['groceries', today])).toEqual({ groceries: [] });
    });
    expect(mockGroceries).toHaveBeenCalledWith(today);
  });

  it('swallows errors', async () => {
    mockSettings.mockRejectedValue(new Error('offline'));
    mockStores.mockRejectedValue(new Error('offline'));
    mockPantry.mockRejectedValue(new Error('offline'));
    mockGroceries.mockRejectedValue(new Error('offline'));
    expect(() => warmPrefetch()).not.toThrow();
    await vi.waitFor(() => expect(mockGroceries).toHaveBeenCalled());
  });
});
