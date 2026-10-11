import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, MutationCache } from '@tanstack/react-query';

const { mockToast } = vi.hoisted(() => ({ mockToast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('sonner', () => ({ toast: mockToast }));

import { ApiError, NetworkError } from './api';
import { handleMutationError, NEEDS_CONNECTION_MESSAGE } from './mutationErrorToast';

function makeClient() {
  return new QueryClient({
    mutationCache: new MutationCache({ onError: handleMutationError }),
    defaultOptions: { mutations: { retry: 0 } },
  });
}

async function run(
  client: QueryClient,
  error: unknown,
  mutationKey?: string[],
  onError?: () => void
) {
  const mutation = client.getMutationCache().build(client, {
    mutationKey,
    mutationFn: () => Promise.reject(error),
    onError,
  });
  await mutation.execute({}).catch(() => undefined);
}

beforeEach(() => vi.clearAllMocks());

describe('handleMutationError (non-queued writes fail fast)', () => {
  it('toasts that a connection is needed when an un-queued mutation hits a NetworkError', async () => {
    await run(makeClient(), new NetworkError('offline'), ['dishes', 'create']);
    expect(mockToast.error).toHaveBeenCalledWith(NEEDS_CONNECTION_MESSAGE, expect.any(Object));
    expect(NEEDS_CONNECTION_MESSAGE).toBe(
      "This needs a connection — try again when you're back online"
    );
  });

  it('also covers mutations with no key and timeouts', async () => {
    await run(makeClient(), new NetworkError('timeout'));
    expect(mockToast.error).toHaveBeenCalledTimes(1);
  });

  it('does not toast for offline-queued mutations (they wait and retry)', async () => {
    await run(makeClient(), new NetworkError('offline'), ['offline', 'grocery', 'check', 'set']);
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it('does not toast for other errors, and the mutation own onError still runs', async () => {
    const own = vi.fn();
    await run(makeClient(), new ApiError(400, 'bad'), ['x'], own);
    expect(mockToast.error).not.toHaveBeenCalled();
    expect(own).toHaveBeenCalled();

    const own2 = vi.fn();
    await run(makeClient(), new NetworkError('offline'), ['x'], own2);
    expect(own2).toHaveBeenCalled();
  });

  it('ignores caller aborts', async () => {
    await run(makeClient(), new NetworkError('aborted'), ['x']);
    expect(mockToast.error).not.toHaveBeenCalled();
  });
});
