import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGroceryChecklist, groceryItemKey } from './useGroceryChecklist';

describe('groceryItemKey', () => {
  it('produces lowercase name::unit key', () => {
    expect(groceryItemKey('Flour', 'G')).toBe('flour::g');
  });

  it('handles null unit', () => {
    expect(groceryItemKey('Salt', null)).toBe('salt::');
  });
});

describe('useGroceryChecklist', () => {
  const weekDate = '2024-06-10';
  const storageKey = `grocery-checked-${weekDate}`;

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('starts with empty checked set', () => {
    const { result } = renderHook(() => useGroceryChecklist(weekDate));
    expect(result.current.checked.size).toBe(0);
  });

  it('loads existing checked items from localStorage', () => {
    localStorage.setItem(storageKey, JSON.stringify(['flour::g', 'salt::']));
    const { result } = renderHook(() => useGroceryChecklist(weekDate));
    expect(result.current.checked.has('flour::g')).toBe(true);
    expect(result.current.checked.has('salt::')).toBe(true);
  });

  it('toggle adds an unchecked item', () => {
    const { result } = renderHook(() => useGroceryChecklist(weekDate));
    act(() => result.current.toggle('flour::g'));
    expect(result.current.checked.has('flour::g')).toBe(true);
  });

  it('toggle removes a checked item', () => {
    const { result } = renderHook(() => useGroceryChecklist(weekDate));
    act(() => result.current.toggle('flour::g'));
    act(() => result.current.toggle('flour::g'));
    expect(result.current.checked.has('flour::g')).toBe(false);
  });

  it('persists toggled state to localStorage', () => {
    const { result } = renderHook(() => useGroceryChecklist(weekDate));
    act(() => result.current.toggle('salt::'));
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as string[];
    expect(stored).toContain('salt::');
  });

  it('clearAll removes all checked items', () => {
    localStorage.setItem(storageKey, JSON.stringify(['flour::g', 'salt::']));
    const { result } = renderHook(() => useGroceryChecklist(weekDate));
    act(() => result.current.clearAll());
    expect(result.current.checked.size).toBe(0);
  });

  it('clearAll persists empty state to localStorage', () => {
    localStorage.setItem(storageKey, JSON.stringify(['flour::g']));
    const { result } = renderHook(() => useGroceryChecklist(weekDate));
    act(() => result.current.clearAll());
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? '["not-empty"]') as string[];
    expect(stored).toHaveLength(0);
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(storageKey, 'not-valid-json{{{');
    const { result } = renderHook(() => useGroceryChecklist(weekDate));
    expect(result.current.checked.size).toBe(0);
  });
});
