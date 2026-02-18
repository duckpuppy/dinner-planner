import { useState, useEffect, useCallback } from 'react';

interface UseSwipeActionsOptions {
  threshold?: number;
  onSwipeStart?: () => void;
  onSwipeEnd?: () => void;
}

export function useSwipeActions(options: UseSwipeActionsOptions = {}) {
  const { threshold = 80, onSwipeStart, onSwipeEnd } = options;
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const openSwipe = useCallback(
    (itemId: string) => {
      setActiveItemId(itemId);
      onSwipeStart?.();
    },
    [onSwipeStart]
  );

  const closeSwipe = useCallback(() => {
    setActiveItemId(null);
    setSwipeOffset(0);
    onSwipeEnd?.();
  }, [onSwipeEnd]);

  const isActive = useCallback(
    (itemId: string) => {
      return activeItemId === itemId;
    },
    [activeItemId]
  );

  const shouldReveal = useCallback(
    (offset: number) => {
      return offset <= -threshold;
    },
    [threshold]
  );

  // Close swipe on outside click
  useEffect(() => {
    if (!activeItemId) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-swipeable-item]')) {
        closeSwipe();
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeItemId, closeSwipe]);

  return {
    activeItemId,
    swipeOffset,
    setSwipeOffset,
    openSwipe,
    closeSwipe,
    isActive,
    shouldReveal,
  };
}
