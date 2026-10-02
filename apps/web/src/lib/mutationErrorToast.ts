import type { Mutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { NetworkError } from './api';

export const NEEDS_CONNECTION_MESSAGE =
  "This needs a connection — try again when you're back online";

/**
 * MutationCache onError: writes that are not queued for offline replay fail fast, so say why.
 * Offline-queued mutations (['offline', ...]) never toast here (they wait and retry), and every
 * other error type is left to the mutation's own onError handler.
 */
export function handleMutationError(
  error: unknown,
  _variables: unknown,
  _context: unknown,
  mutation: Mutation<unknown, unknown, unknown, unknown>
): void {
  if (mutation.options.mutationKey?.[0] === 'offline') return;
  if (error instanceof NetworkError && error.kind !== 'aborted') {
    toast.error(NEEDS_CONNECTION_MESSAGE, { id: 'needs-connection' });
  }
}
