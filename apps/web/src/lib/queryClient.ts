import { MutationCache, QueryClient } from '@tanstack/react-query';
import { handleMutationError } from './mutationErrorToast';

export const CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 days, matches the offline session window

/**
 * Shared QueryClient. Lives in its own module (no imports from the auth store or
 * the persistence layer) so both can depend on it without a circular import.
 */
export const queryClient = new QueryClient({
  mutationCache: new MutationCache({ onError: handleMutationError }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: CACHE_MAX_AGE,
      retry: 1,
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});
