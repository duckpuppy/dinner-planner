import { useCallback, useMemo } from 'react';
import { enqueue, nextClientTimestamp } from '@/lib/offlineMutations';
import { applyPendingOps, type GroceriesData, type OverlaidGroceries } from '@/lib/pendingOps';
import { usePendingOps } from '@/hooks/usePendingOps';
import { useAuthStore } from '@/stores/auth';
import type { CheckedByUser } from '@/components/CheckedByChip';

export function groceryItemKey(name: string, unit: string | null): string {
  return `${name.toLowerCase()}::${unit?.toLowerCase() ?? ''}`;
}

export interface GroceryChecklist {
  /** Server data with queued offline changes applied (undefined until the first load). */
  view: OverlaidGroceries | undefined;
  checked: Set<string>;
  /** Item keys whose checked state hasn't synced yet. */
  pendingKeys: Set<string>;
  /** Who checked each checked item (server attribution; the current user while still pending). */
  checkedBy: Map<string, CheckedByUser>;
  toggle: (key: string, itemName: string) => void;
  clearAll: () => void;
}

const EMPTY_SET: Set<string> = new Set();
const EMPTY_BY: Map<string, CheckedByUser> = new Map();

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
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;
  const userName = user?.displayName;

  const checkedBy = useMemo(() => {
    if (!view) return EMPTY_BY;
    const m = new Map<string, CheckedByUser>();
    for (const c of data?.checks ?? []) {
      if (c.checked && c.checkedBy) m.set(c.itemKey, c.checkedBy);
    }
    // A change that hasn't synced is ours; the server will confirm with the same attribution.
    for (const key of view.pendingKeys) {
      if (!checked.has(key)) m.delete(key);
      else if (userId && userName) m.set(key, { id: userId, displayName: userName });
    }
    return m;
  }, [view, data, checked, userId, userName]);

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

  return { view, checked, pendingKeys, checkedBy, toggle, clearAll };
}
