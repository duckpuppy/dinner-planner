import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  GROCERY_POLL_LIVE_MS,
  GROCERY_POLL_MS,
  groceriesQueryKey,
  groceryRefetchInterval,
} from './groceryQueryKey';

describe('groceriesQueryKey', () => {
  it('keys by week start for the configured week start day', () => {
    // 2024-06-12 is a Wednesday; weeks starting Sunday (0) and Monday (1).
    expect(groceriesQueryKey('2024-06-12', 0)).toEqual(['groceries', '2024-06-09']);
    expect(groceriesQueryKey('2024-06-12', 1)).toEqual(['groceries', '2024-06-10']);
  });

  it('gives every day of a week the same key (stable across midnight)', () => {
    const keys = ['2024-06-10', '2024-06-11', '2024-06-16'].map((d) =>
      JSON.stringify(groceriesQueryKey(d, 1))
    );
    expect(new Set(keys).size).toBe(1);
  });

  it('crosses month and year boundaries correctly', () => {
    expect(groceriesQueryKey('2025-01-01', 1)).toEqual(['groceries', '2024-12-30']);
  });

  it('falls back to the requested date until settings are known', () => {
    expect(groceriesQueryKey('2024-06-12', undefined)).toEqual(['groceries', '2024-06-12']);
  });

  it('falls back to the raw value for an unparseable date', () => {
    expect(groceriesQueryKey('nonsense', 1)).toEqual(['groceries', 'nonsense']);
  });
});

describe('groceryRefetchInterval', () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient();
  });

  it('polls every 5s when nothing is queued', () => {
    expect(groceryRefetchInterval(client)).toBe(GROCERY_POLL_MS);
  });

  it('is disabled while offline grocery mutations are pending', () => {
    const spy = vi.spyOn(client, 'isMutating').mockReturnValue(2);
    expect(groceryRefetchInterval(client)).toBe(false);
    expect(spy).toHaveBeenCalledWith({ mutationKey: ['offline', 'grocery'] });
  });

  it('only watches grocery writes, not pantry ones', () => {
    const mutation = client.getMutationCache().build(client, {
      mutationKey: ['offline', 'pantry', 'add'],
      mutationFn: () => new Promise(() => {}),
    });
    void mutation.execute({}).catch(() => {});
    expect(groceryRefetchInterval(client)).toBe(GROCERY_POLL_MS);
    const grocery = client.getMutationCache().build(client, {
      mutationKey: ['offline', 'grocery', 'check', 'set'],
      mutationFn: () => new Promise(() => {}),
    });
    void grocery.execute({}).catch(() => {});
    expect(groceryRefetchInterval(client)).toBe(false);
  });

  it('slows to 60s when a live connection is up (SSE hook)', () => {
    expect(groceryRefetchInterval(client, { liveConnected: true })).toBe(GROCERY_POLL_LIVE_MS);
  });
});
