import { useMutationState } from '@tanstack/react-query';
import type { PendingOp } from '@/lib/pendingOps';

/** The queued (not yet synced) offline operations, in FIFO order. */
export function usePendingOps(): PendingOp[] {
  return useMutationState({
    filters: { mutationKey: ['offline'], status: 'pending' },
    select: (m): PendingOp => ({
      key: m.options.mutationKey ?? [],
      vars: m.state.variables,
      submittedAt: m.state.submittedAt,
    }),
  });
}
