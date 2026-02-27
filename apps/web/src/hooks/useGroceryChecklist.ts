import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { menus } from '@/lib/api';

export function groceryItemKey(name: string, unit: string | null): string {
  return `${name.toLowerCase()}::${unit?.toLowerCase() ?? ''}`;
}

export interface GroceryChecklist {
  checked: Set<string>;
  toggle: (key: string, itemName: string) => void;
  clearAll: () => void;
}

interface UseGroceryChecklistOptions {
  checkedKeys: string[];
  weekStartDate: string;
  requestedDate: string;
}

type GroceriesQueryData = {
  groceries: unknown[];
  customItems: unknown[];
  weekStartDate: string;
  checkedKeys: string[];
};

export function useGroceryChecklist({
  checkedKeys,
  weekStartDate,
  requestedDate,
}: UseGroceryChecklistOptions): GroceryChecklist {
  const queryClient = useQueryClient();
  const queryKey = ['groceries', requestedDate];

  const checked = new Set(checkedKeys);

  const toggle = useCallback(
    (key: string, itemName: string) => {
      const isChecked = checked.has(key);
      const nextChecked = isChecked
        ? checkedKeys.filter((k) => k !== key)
        : [...checkedKeys, key];

      // Optimistic update
      queryClient.setQueryData<GroceriesQueryData>(queryKey, (prev) => {
        if (!prev) return prev;
        return { ...prev, checkedKeys: nextChecked };
      });

      // Server sync — revert on error
      menus
        .toggleGroceryCheck(weekStartDate, key, itemName)
        .then(({ checked: serverChecked }) => {
          queryClient.setQueryData<GroceriesQueryData>(queryKey, (prev) => {
            if (!prev) return prev;
            const keys = prev.checkedKeys.filter((k) => k !== key);
            return {
              ...prev,
              checkedKeys: serverChecked ? [...keys, key] : keys,
            };
          });
        })
        .catch(() => {
          // Revert optimistic update
          queryClient.setQueryData<GroceriesQueryData>(queryKey, (prev) => {
            if (!prev) return prev;
            return { ...prev, checkedKeys };
          });
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [checkedKeys, weekStartDate, requestedDate, queryClient]
  );

  const clearAll = useCallback(() => {
    // Optimistic update
    queryClient.setQueryData<GroceriesQueryData>(queryKey, (prev) => {
      if (!prev) return prev;
      return { ...prev, checkedKeys: [] };
    });

    // Server sync — revert on error
    menus.clearGroceryChecks(weekStartDate).catch(() => {
      queryClient.setQueryData<GroceriesQueryData>(queryKey, (prev) => {
        if (!prev) return prev;
        return { ...prev, checkedKeys };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedKeys, weekStartDate, requestedDate, queryClient]);

  return { checked, toggle, clearAll };
}
