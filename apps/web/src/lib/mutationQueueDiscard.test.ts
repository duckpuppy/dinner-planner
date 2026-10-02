import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
const mockDel = vi.fn();
const mockToastError = vi.fn();

vi.mock('idb-keyval', () => ({
  get: (...a: unknown[]) => mockGet(...a),
  del: (...a: unknown[]) => mockDel(...a),
}));
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => mockToastError(...a) } }));

import {
  MUTATION_QUEUE_KEY,
  discardPersistedMutationQueue,
  discardQueueAndNotify,
} from './mutationQueueDiscard';

beforeEach(() => {
  vi.clearAllMocks();
  mockDel.mockResolvedValue(undefined);
});

describe('mutationQueueDiscard', () => {
  it('is a no-op when no queue exists', async () => {
    mockGet.mockResolvedValue(undefined);
    expect(await discardQueueAndNotify()).toBe(0);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it.each([
    ['array', [1, 2, 3]],
    ['{mutations}', { mutations: [1, 2, 3] }],
    ['{clientState.mutations}', { clientState: { mutations: [1, 2, 3] } }],
  ])('counts and deletes a %s queue, then toasts', async (_n, value) => {
    mockGet.mockResolvedValue(value);
    expect(await discardQueueAndNotify()).toBe(3);
    expect(mockDel).toHaveBeenCalledWith(MUTATION_QUEUE_KEY);
    expect(mockToastError).toHaveBeenCalledWith(
      '3 unsynced changes were discarded because you were signed out'
    );
  });

  it('uses the singular for one change', async () => {
    mockGet.mockResolvedValue([1]);
    await discardQueueAndNotify();
    expect(mockToastError).toHaveBeenCalledWith(
      '1 unsynced change was discarded because you were signed out'
    );
  });

  it('survives idb failures', async () => {
    mockGet.mockRejectedValue(new Error('x'));
    mockDel.mockRejectedValue(new Error('y'));
    expect(await discardPersistedMutationQueue()).toBe(0);
  });

  it('does not toast for an unrecognised empty shape', async () => {
    mockGet.mockResolvedValue({ foo: 1 });
    expect(await discardQueueAndNotify()).toBe(0);
    expect(mockToastError).not.toHaveBeenCalled();
  });
});
