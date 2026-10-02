import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { useOnlineStatus } from './useOnlineStatus';

afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
});

describe('useOnlineStatus', () => {
  it('reflects the onlineManager state', () => {
    onlineManager.setOnline(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it('re-renders when the online state changes', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
    act(() => onlineManager.setOnline(false));
    expect(result.current).toBe(false);
    act(() => onlineManager.setOnline(true));
    expect(result.current).toBe(true);
  });
});
