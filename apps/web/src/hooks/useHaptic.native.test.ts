/**
 * Tests for useHaptic native (Capacitor) path.
 * These are in a separate file because `isNative` is evaluated at module load time,
 * so we need vi.mock to run before the module is imported.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockImpact = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockNotification = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
  },
}));

vi.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact: mockImpact,
    notification: mockNotification,
  },
  ImpactStyle: {
    Light: 'LIGHT',
    Medium: 'MEDIUM',
    Heavy: 'HEAVY',
  },
  NotificationType: {
    Success: 'SUCCESS',
    Warning: 'WARNING',
    Error: 'ERROR',
  },
}));

import { useHaptic } from './useHaptic';

describe('useHaptic (native platform)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockImpact.mockResolvedValue(undefined);
    mockNotification.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('tap feedback', () => {
    it('calls Haptics.impact with Light style on native', () => {
      const { result } = renderHook(() => useHaptic());

      result.current.haptic.tap();

      expect(mockImpact).toHaveBeenCalledWith({ style: 'LIGHT' });
      expect(mockImpact).toHaveBeenCalledTimes(1);
    });

    it('throttles rapid calls on native', () => {
      const { result } = renderHook(() => useHaptic());

      result.current.haptic.tap();
      expect(mockImpact).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(50);
      result.current.haptic.tap();
      expect(mockImpact).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(50);
      result.current.haptic.tap();
      expect(mockImpact).toHaveBeenCalledTimes(2);
    });
  });

  describe('success feedback', () => {
    it('calls Haptics.notification with Success type on native', () => {
      const { result } = renderHook(() => useHaptic());

      result.current.haptic.success();

      expect(mockNotification).toHaveBeenCalledWith({ type: 'SUCCESS' });
      expect(mockNotification).toHaveBeenCalledTimes(1);
    });
  });

  describe('error feedback', () => {
    it('calls Haptics.notification with Error type on native', () => {
      const { result } = renderHook(() => useHaptic());

      result.current.haptic.error();

      expect(mockNotification).toHaveBeenCalledWith({ type: 'ERROR' });
      expect(mockNotification).toHaveBeenCalledTimes(1);
    });

    it('silently ignores haptic errors on native', async () => {
      mockImpact.mockRejectedValue(new Error('Haptic not supported'));
      const { result } = renderHook(() => useHaptic());

      // Should not throw
      expect(() => result.current.haptic.tap()).not.toThrow();
    });
  });
});
