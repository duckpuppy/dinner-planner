import { menus, pantry, settings, stores } from './api';
import { queryClient } from './queryClient';
import { localDateStr } from './utils';

/**
 * Background-prefetch the data an offline cold start needs even if those pages were never
 * visited. Keys and fetchers mirror the pages exactly (WeekPage/AdminSettingsPage 'settings',
 * GroceryPage 'stores' and ['groceries', date], PantryPage 'pantry'). Standing items have no
 * query of their own: they arrive inside the groceries response. Never blocks, never throws.
 */
export function warmPrefetch(): void {
  const today = localDateStr();
  void Promise.allSettled([
    queryClient.prefetchQuery({ queryKey: ['settings'], queryFn: () => settings.get() }),
    queryClient.prefetchQuery({ queryKey: ['stores'], queryFn: stores.list }),
    queryClient.prefetchQuery({ queryKey: ['pantry'], queryFn: () => pantry.list() }),
    queryClient.prefetchQuery({
      queryKey: ['groceries', today],
      queryFn: () => menus.getGroceries(today),
    }),
  ]);
}
