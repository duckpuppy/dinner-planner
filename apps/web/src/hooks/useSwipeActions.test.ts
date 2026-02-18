import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwipeActions } from './useSwipeActions';

describe('useSwipeActions', () => {
  beforeEach(() => {
    // Clear any existing event listeners
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('initializes with no active item', () => {
      const { result } = renderHook(() => useSwipeActions());

      expect(result.current.activeItemId).toBeNull();
      expect(result.current.swipeOffset).toBe(0);
    });

    it('accepts custom threshold option', () => {
      const { result } = renderHook(() => useSwipeActions({ threshold: 120 }));

      // Threshold of 120 means offset must be <= -120 to reveal
      expect(result.current.shouldReveal(-119)).toBe(false);
      expect(result.current.shouldReveal(-120)).toBe(true);
      expect(result.current.shouldReveal(-121)).toBe(true);
    });

    it('uses default threshold of 80 when not specified', () => {
      const { result } = renderHook(() => useSwipeActions());

      expect(result.current.shouldReveal(-79)).toBe(false);
      expect(result.current.shouldReveal(-80)).toBe(true);
      expect(result.current.shouldReveal(-100)).toBe(true);
    });
  });

  describe('openSwipe', () => {
    it('sets active item ID', () => {
      const { result } = renderHook(() => useSwipeActions());

      act(() => {
        result.current.openSwipe('item-1');
      });

      expect(result.current.activeItemId).toBe('item-1');
    });

    it('calls onSwipeStart callback when provided', () => {
      const onSwipeStart = vi.fn();
      const { result } = renderHook(() => useSwipeActions({ onSwipeStart }));

      act(() => {
        result.current.openSwipe('item-1');
      });

      expect(onSwipeStart).toHaveBeenCalledTimes(1);
    });

    it('does not error when onSwipeStart is not provided', () => {
      const { result } = renderHook(() => useSwipeActions());

      expect(() => {
        act(() => {
          result.current.openSwipe('item-1');
        });
      }).not.toThrow();
    });

    it('can switch between different items', () => {
      const { result } = renderHook(() => useSwipeActions());

      act(() => {
        result.current.openSwipe('item-1');
      });
      expect(result.current.activeItemId).toBe('item-1');

      act(() => {
        result.current.openSwipe('item-2');
      });
      expect(result.current.activeItemId).toBe('item-2');
    });
  });

  describe('closeSwipe', () => {
    it('resets active item to null', () => {
      const { result } = renderHook(() => useSwipeActions());

      act(() => {
        result.current.openSwipe('item-1');
      });
      expect(result.current.activeItemId).toBe('item-1');

      act(() => {
        result.current.closeSwipe();
      });
      expect(result.current.activeItemId).toBeNull();
    });

    it('resets swipe offset to 0', () => {
      const { result } = renderHook(() => useSwipeActions());

      act(() => {
        result.current.setSwipeOffset(-100);
      });
      expect(result.current.swipeOffset).toBe(-100);

      act(() => {
        result.current.closeSwipe();
      });
      expect(result.current.swipeOffset).toBe(0);
    });

    it('calls onSwipeEnd callback when provided', () => {
      const onSwipeEnd = vi.fn();
      const { result } = renderHook(() => useSwipeActions({ onSwipeEnd }));

      act(() => {
        result.current.openSwipe('item-1');
      });

      act(() => {
        result.current.closeSwipe();
      });

      expect(onSwipeEnd).toHaveBeenCalledTimes(1);
    });

    it('does not error when onSwipeEnd is not provided', () => {
      const { result } = renderHook(() => useSwipeActions());

      act(() => {
        result.current.openSwipe('item-1');
      });

      expect(() => {
        act(() => {
          result.current.closeSwipe();
        });
      }).not.toThrow();
    });
  });

  describe('isActive', () => {
    it('returns true when item ID matches active item', () => {
      const { result } = renderHook(() => useSwipeActions());

      act(() => {
        result.current.openSwipe('item-1');
      });

      expect(result.current.isActive('item-1')).toBe(true);
    });

    it('returns false when item ID does not match active item', () => {
      const { result } = renderHook(() => useSwipeActions());

      act(() => {
        result.current.openSwipe('item-1');
      });

      expect(result.current.isActive('item-2')).toBe(false);
    });

    it('returns false when no item is active', () => {
      const { result } = renderHook(() => useSwipeActions());

      expect(result.current.isActive('item-1')).toBe(false);
    });
  });

  describe('shouldReveal', () => {
    it('returns true when offset meets threshold', () => {
      const { result } = renderHook(() => useSwipeActions({ threshold: 80 }));

      expect(result.current.shouldReveal(-80)).toBe(true);
      expect(result.current.shouldReveal(-100)).toBe(true);
      expect(result.current.shouldReveal(-200)).toBe(true);
    });

    it('returns false when offset does not meet threshold', () => {
      const { result } = renderHook(() => useSwipeActions({ threshold: 80 }));

      expect(result.current.shouldReveal(-79)).toBe(false);
      expect(result.current.shouldReveal(-50)).toBe(false);
      expect(result.current.shouldReveal(0)).toBe(false);
      expect(result.current.shouldReveal(50)).toBe(false);
    });
  });

  describe('setSwipeOffset', () => {
    it('updates swipe offset state', () => {
      const { result } = renderHook(() => useSwipeActions());

      act(() => {
        result.current.setSwipeOffset(-50);
      });
      expect(result.current.swipeOffset).toBe(-50);

      act(() => {
        result.current.setSwipeOffset(-100);
      });
      expect(result.current.swipeOffset).toBe(-100);

      act(() => {
        result.current.setSwipeOffset(0);
      });
      expect(result.current.swipeOffset).toBe(0);
    });
  });

  describe('click outside behavior', () => {
    it('closes swipe when clicking outside swipeable item', () => {
      const { result } = renderHook(() => useSwipeActions());

      act(() => {
        result.current.openSwipe('item-1');
      });
      expect(result.current.activeItemId).toBe('item-1');

      // Simulate click outside (on document body)
      act(() => {
        const clickEvent = new MouseEvent('click', { bubbles: true });
        document.body.dispatchEvent(clickEvent);
      });

      expect(result.current.activeItemId).toBeNull();
    });

    it('does not close swipe when clicking inside swipeable item', () => {
      const { result } = renderHook(() => useSwipeActions());

      // Create a swipeable item element
      const swipeableItem = document.createElement('div');
      swipeableItem.setAttribute('data-swipeable-item', '');
      document.body.appendChild(swipeableItem);

      act(() => {
        result.current.openSwipe('item-1');
      });
      expect(result.current.activeItemId).toBe('item-1');

      // Simulate click inside swipeable item
      act(() => {
        const clickEvent = new MouseEvent('click', { bubbles: true });
        swipeableItem.dispatchEvent(clickEvent);
      });

      // Should still be active
      expect(result.current.activeItemId).toBe('item-1');
    });

    it('does not add event listener when no item is active', () => {
      renderHook(() => useSwipeActions());
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

      // No item opened, so no listener should be added
      expect(addEventListenerSpy).not.toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('removes event listener when component unmounts', () => {
      const { result, unmount } = renderHook(() => useSwipeActions());
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      act(() => {
        result.current.openSwipe('item-1');
      });

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('removes event listener when swipe is closed', () => {
      const { result } = renderHook(() => useSwipeActions());
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      act(() => {
        result.current.openSwipe('item-1');
      });

      act(() => {
        result.current.closeSwipe();
      });

      expect(removeEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
    });
  });

  describe('callback stability', () => {
    it('openSwipe callback remains stable across re-renders', () => {
      const { result, rerender } = renderHook(() => useSwipeActions());

      const firstOpenSwipe = result.current.openSwipe;
      rerender();
      const secondOpenSwipe = result.current.openSwipe;

      expect(firstOpenSwipe).toBe(secondOpenSwipe);
    });

    it('closeSwipe callback remains stable across re-renders', () => {
      const { result, rerender } = renderHook(() => useSwipeActions());

      const firstCloseSwipe = result.current.closeSwipe;
      rerender();
      const secondCloseSwipe = result.current.closeSwipe;

      expect(firstCloseSwipe).toBe(secondCloseSwipe);
    });

    it('isActive callback updates when activeItemId changes', () => {
      const { result, rerender } = renderHook(() => useSwipeActions());

      const firstIsActive = result.current.isActive;

      act(() => {
        result.current.openSwipe('item-1');
      });

      rerender();
      const secondIsActive = result.current.isActive;

      // Reference changes because activeItemId changed
      expect(firstIsActive).not.toBe(secondIsActive);
    });
  });
});
