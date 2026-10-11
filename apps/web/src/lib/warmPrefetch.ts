import { menus, pantry, settings, stores } from './api';
import { groceriesQueryKey } from './groceryQueryKey';
import { queryClient } from './queryClient';
import { localDateStr } from './utils';

/**
 * Background-prefetch the data an offline cold start needs even if those pages were never
 * visited. Keys and fetchers mirror the pages exactly (WeekPage/AdminSettingsPage 'settings',
 * GroceryPage 'stores' and the week-start groceries key, PantryPage 'pantry'). Standing items
 * have no query of their own: they arrive inside the groceries response. Never blocks, never
 * throws.
 */
export function warmPrefetch(): void {
  const today = localDateStr();

  // The groceries key is derived from weekStartDay, so it waits for settings (cached or fetched).
  const groceries = queryClient
    .prefetchQuery({ queryKey: ['settings'], queryFn: () => settings.get() })
    .catch(() => undefined)
    .then(() => {
      const weekStartDay = queryClient.getQueryData<{ settings: { weekStartDay: number } }>([
        'settings',
      ])?.settings?.weekStartDay;
      return queryClient.prefetchQuery({
        queryKey: groceriesQueryKey(today, weekStartDay),
        queryFn: () => menus.getGroceries(today),
      });
    });

  void Promise.allSettled([
    groceries,
    queryClient.prefetchQuery({ queryKey: ['stores'], queryFn: stores.list }),
    queryClient.prefetchQuery({ queryKey: ['pantry'], queryFn: () => pantry.list() }),
  ]);
}
