import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useGroceryChecklist, groceryItemKey } from './useGroceryChecklist';

vi.mock('@/lib/api', () => ({
  menus: {
    toggleGroceryCheck: vi.fn(),
    clearGroceryChecks: vi.fn(),
  },
}));

import { menus } from '@/lib/api';

const mockedMenus = vi.mocked(menus);

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

const WEEK_DATE = '2024-06-10';
const REQUESTED_DATE = '2024-06-12';
const QUERY_KEY = ['groceries', REQUESTED_DATE];

function makeQueryData(checkedKeys: string[] = []) {
  return {
    groceries: [],
    customItems: [],
    weekStartDate: WEEK_DATE,
    checkedKeys,
  };
}

describe('groceryItemKey', () => {
  it('produces lowercase name::unit key', () => {
    expect(groceryItemKey('Flour', 'G')).toBe('flour::g');
  });

  it('handles null unit', () => {
    expect(groceryItemKey('Salt', null)).toBe('salt::');
  });
});

describe('useGroceryChecklist', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
    mockedMenus.toggleGroceryCheck.mockResolvedValue({ itemKey: 'flour::g', checked: true });
    mockedMenus.clearGroceryChecks.mockResolvedValue(undefined);
  });

  function renderChecklist(checkedKeys: string[] = []) {
    queryClient.setQueryData(QUERY_KEY, makeQueryData(checkedKeys));
    return renderHook(
      () =>
        useGroceryChecklist({
          checkedKeys,
          weekStartDate: WEEK_DATE,
          requestedDate: REQUESTED_DATE,
        }),
      { wrapper: makeWrapper(queryClient) }
    );
  }

  it('exposes checked set derived from checkedKeys prop', () => {
    const { result } = renderChecklist(['flour::g', 'salt::']);
    expect(result.current.checked.has('flour::g')).toBe(true);
    expect(result.current.checked.has('salt::')).toBe(true);
  });

  it('starts with empty checked set when no checkedKeys', () => {
    const { result } = renderChecklist([]);
    expect(result.current.checked.size).toBe(0);
  });

  it('toggle calls menus.toggleGroceryCheck with correct args', async () => {
    const { result } = renderChecklist([]);
    await act(async () => {
      result.current.toggle('flour::g', 'Flour');
    });
    expect(mockedMenus.toggleGroceryCheck).toHaveBeenCalledWith(WEEK_DATE, 'flour::g', 'Flour');
  });

  it('toggle optimistically adds key to query cache', () => {
    queryClient.setQueryData(QUERY_KEY, makeQueryData([]));

    mockedMenus.toggleGroceryCheck.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ itemKey: 'flour::g', checked: true }), 100)
        )
    );

    const { result } = renderChecklist([]);

    act(() => {
      result.current.toggle('flour::g', 'Flour');
    });

    const cached = queryClient.getQueryData<ReturnType<typeof makeQueryData>>(QUERY_KEY);
    expect(cached?.checkedKeys).toContain('flour::g');
  });

  it('toggle optimistically removes key when already checked', () => {
    queryClient.setQueryData(QUERY_KEY, makeQueryData(['flour::g']));
    mockedMenus.toggleGroceryCheck.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ itemKey: 'flour::g', checked: false }), 100)
        )
    );

    const { result } = renderChecklist(['flour::g']);

    act(() => {
      result.current.toggle('flour::g', 'Flour');
    });

    const cached = queryClient.getQueryData<ReturnType<typeof makeQueryData>>(QUERY_KEY);
    expect(cached?.checkedKeys).not.toContain('flour::g');
  });

  it('toggle reverts optimistic update on server error', async () => {
    queryClient.setQueryData(QUERY_KEY, makeQueryData([]));
    mockedMenus.toggleGroceryCheck.mockRejectedValue(new Error('Server error'));

    const { result } = renderChecklist([]);

    await act(async () => {
      result.current.toggle('flour::g', 'Flour');
    });

    const cached = queryClient.getQueryData<ReturnType<typeof makeQueryData>>(QUERY_KEY);
    expect(cached?.checkedKeys).not.toContain('flour::g');
  });

  it('toggle syncs server checked=true result into cache', async () => {
    mockedMenus.toggleGroceryCheck.mockResolvedValue({ itemKey: 'flour::g', checked: true });
    queryClient.setQueryData(QUERY_KEY, makeQueryData([]));
    const { result } = renderChecklist([]);

    await act(async () => {
      result.current.toggle('flour::g', 'Flour');
    });

    const cached = queryClient.getQueryData<ReturnType<typeof makeQueryData>>(QUERY_KEY);
    expect(cached?.checkedKeys).toContain('flour::g');
  });

  it('toggle syncs server checked=false result into cache', async () => {
    mockedMenus.toggleGroceryCheck.mockResolvedValue({ itemKey: 'flour::g', checked: false });
    queryClient.setQueryData(QUERY_KEY, makeQueryData(['flour::g']));
    const { result } = renderChecklist(['flour::g']);

    await act(async () => {
      result.current.toggle('flour::g', 'Flour');
    });

    const cached = queryClient.getQueryData<ReturnType<typeof makeQueryData>>(QUERY_KEY);
    expect(cached?.checkedKeys).not.toContain('flour::g');
  });

  it('clearAll calls menus.clearGroceryChecks', async () => {
    const { result } = renderChecklist(['flour::g']);
    await act(async () => {
      result.current.clearAll();
    });
    expect(mockedMenus.clearGroceryChecks).toHaveBeenCalledWith(WEEK_DATE);
  });

  it('clearAll optimistically clears query cache', () => {
    queryClient.setQueryData(QUERY_KEY, makeQueryData(['flour::g', 'salt::']));
    mockedMenus.clearGroceryChecks.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    const { result } = renderChecklist(['flour::g', 'salt::']);

    act(() => {
      result.current.clearAll();
    });

    const cached = queryClient.getQueryData<ReturnType<typeof makeQueryData>>(QUERY_KEY);
    expect(cached?.checkedKeys).toHaveLength(0);
  });

  it('clearAll reverts optimistic update on server error', async () => {
    queryClient.setQueryData(QUERY_KEY, makeQueryData(['flour::g']));
    mockedMenus.clearGroceryChecks.mockRejectedValue(new Error('Server error'));

    const { result } = renderChecklist(['flour::g']);

    await act(async () => {
      result.current.clearAll();
    });

    const cached = queryClient.getQueryData<ReturnType<typeof makeQueryData>>(QUERY_KEY);
    expect(cached?.checkedKeys).toContain('flour::g');
  });
});
