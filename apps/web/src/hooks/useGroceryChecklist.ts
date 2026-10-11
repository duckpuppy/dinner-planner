import { useCallback, useMemo } from 'react';
import { enqueue, nextClientTimestamp } from '@/lib/offlineMutations';
import { applyPendingOps, type GroceriesData, type OverlaidGroceries } from '@/lib/pendingOps';
import { usePendingOps } from '@/hooks/usePendingOps';

export function groceryItemKey(name: string, unit: string | null): string {
  return `${name.toLowerCase()}::${unit?.toLowerCase() ?? ''}`;
}

export interface GroceryChecklist {
  /** Server data with queued offline changes applied (undefined until the first load). */
  view: OverlaidGroceries | undefined;
  checked: Set<string>;
  /** Item keys whose checked state hasn't synced yet. */
  pendingKeys: Set<string>;
  toggle: (key: string, itemName: string) => void;
  clearAll: () => void;
}

const EMPTY_SET: Set<string> = new Set();

export function useGroceryChecklist({
  data,
}: {
  data: GroceriesData | undefined;
}): GroceryChecklist {
  const ops = usePendingOps();
  const view = useMemo(() => (data ? applyPendingOps(data, ops) : undefined), [data, ops]);
  const checked = useMemo(() => (view ? new Set(view.checkedKeys) : EMPTY_SET), [view]);
  const pendingKeys = view?.pendingKeys ?? EMPTY_SET;
  const weekDate = data?.weekStartDate;

  const toggle = useCallback(
    (key: string, itemName: string) => {
      if (!weekDate) return;
      void enqueue('checkSet', {
        weekDate,
        itemKey: key,
        itemName,
        checked: !checked.has(key),
        clientUpdatedAt: nextClientTimestamp(),
      });
    },
    [weekDate, checked]
  );

  const clearAll = useCallback(() => {
    if (!weekDate) return;
    void enqueue('checkClear', { weekDate, clientUpdatedAt: nextClientTimestamp() });
  }, [weekDate]);

  return { view, checked, pendingKeys, toggle, clearAll };
}
