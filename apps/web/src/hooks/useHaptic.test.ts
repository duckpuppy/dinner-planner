import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHaptic } from './useHaptic';

describe('useHaptic', () => {
  let vibrateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vibrateMock = vi.fn();
    vi.stubGlobal('navigator', {
      vibrate: vibrateMock,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('tap feedback', () => {
    it('triggers 10ms vibration', () => {
      const { result } = renderHook(() => useHaptic());

      result.current.haptic.tap();

      expect(vibrateMock).toHaveBeenCalledWith(10);
      expect(vibrateMock).toHaveBeenCalledTimes(1);
    });

    it('throttles rapid calls to 100ms intervals', () => {
      const { result } = renderHook(() => useHaptic());

      result.current.haptic.tap();
      expect(vibrateMock).toHaveBeenCalledTimes(1);

      // Second call within 100ms should be throttled
      vi.advanceTimersByTime(50);
      result.current.haptic.tap();
      expect(vibrateMock).toHaveBeenCalledTimes(1);

      // Third call after 100ms should execute
      vi.advanceTimersByTime(50);
      result.current.haptic.tap();
      expect(vibrateMock).toHaveBeenCalledTimes(2);
    });

    it('does not vibrate when navigator.vibrate is unavailable', () => {
      vi.stubGlobal('navigator', {});
      const { result } = renderHook(() => useHaptic());

      result.current.haptic.tap();

      expect(vibrateMock).not.toHaveBeenCalled();
    });
  });

  describe('success feedback', () => {
    it('triggers double pulse pattern [20, 10, 20]', () => {
      const { result } = renderHook(() => useHaptic());

      result.current.haptic.success();

      expect(vibrateMock).toHaveBeenCalledWith([20, 10, 20]);
      expect(vibrateMock).toHaveBeenCalledTimes(1);
    });

    it('throttles rapid calls independently from tap', () => {
      const { result } = renderHook(() => useHaptic());

      result.current.haptic.tap();
      result.current.haptic.success();

      // Both should execute (different throttle timers)
      expect(vibrateMock).toHaveBeenCalledTimes(2);
      expect(vibrateMock).toHaveBeenNthCalledWith(1, 10);
      expect(vibrateMock).toHaveBeenNthCalledWith(2, [20, 10, 20]);
    });
  });

  describe('error feedback', () => {
    it('triggers 50ms vibration', () => {
      const { result } = renderHook(() => useHaptic());

      result.current.haptic.error();

      expect(vibrateMock).toHaveBeenCalledWith(50);
      expect(vibrateMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('throttling behavior', () => {
    it('maintains separate throttle timers for each feedback type', () => {
      const { result } = renderHook(() => useHaptic());

      // Call all three types
      result.current.haptic.tap();
      result.current.haptic.success();
      result.current.haptic.error();

      // All three should execute (separate timers)
      expect(vibrateMock).toHaveBeenCalledTimes(3);
      expect(vibrateMock).toHaveBeenNthCalledWith(1, 10);
      expect(vibrateMock).toHaveBeenNthCalledWith(2, [20, 10, 20]);
      expect(vibrateMock).toHaveBeenNthCalledWith(3, 50);
    });

    it('resets throttle after 100ms', () => {
      const { result } = renderHook(() => useHaptic());

      result.current.haptic.tap();
      vi.advanceTimersByTime(99);
      result.current.haptic.tap();
      expect(vibrateMock).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1);
      result.current.haptic.tap();
      expect(vibrateMock).toHaveBeenCalledTimes(2);
    });
  });
});
