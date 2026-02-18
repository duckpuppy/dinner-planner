import { useState, useCallback, useEffect } from 'react';

const STORAGE_PREFIX = 'grocery-checked-';

function storageKey(weekStartDate: string): string {
  return `${STORAGE_PREFIX}${weekStartDate}`;
}

function loadChecked(weekStartDate: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(weekStartDate));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveChecked(weekStartDate: string, checked: Set<string>): void {
  try {
    localStorage.setItem(storageKey(weekStartDate), JSON.stringify(Array.from(checked)));
  } catch {
    // Storage quota exceeded or unavailable — ignore
  }
}

export function groceryItemKey(name: string, unit: string | null): string {
  return `${name.toLowerCase()}::${unit?.toLowerCase() ?? ''}`;
}

export interface GroceryChecklist {
  checked: Set<string>;
  toggle: (key: string) => void;
  clearAll: () => void;
}

export function useGroceryChecklist(weekStartDate: string): GroceryChecklist {
  const [checked, setChecked] = useState<Set<string>>(() =>
    weekStartDate ? loadChecked(weekStartDate) : new Set()
  );

  // Reload state when weekStartDate resolves (e.g., after API response)
  useEffect(() => {
    if (weekStartDate) {
      setChecked(loadChecked(weekStartDate));
    }
  }, [weekStartDate]);

  const toggle = useCallback(
    (key: string) => {
      setChecked((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        if (weekStartDate) saveChecked(weekStartDate, next);
        return next;
      });
    },
    [weekStartDate]
  );

  const clearAll = useCallback(() => {
    const empty = new Set<string>();
    if (weekStartDate) saveChecked(weekStartDate, empty);
    setChecked(empty);
  }, [weekStartDate]);

  return { checked, toggle, clearAll };
}
