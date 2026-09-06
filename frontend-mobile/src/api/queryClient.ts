import { QueryClient } from '@tanstack/react-query';

const QUERY_STALE_TIME_MS = 30_000;
const QUERY_GARBAGE_COLLECTION_TIME_MS = 30 * 60_000;

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number(error.status)
    : null;
  if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return false;
  }
  return failureCount < 2;
}

export const mobileQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: QUERY_GARBAGE_COLLECTION_TIME_MS,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      retry: shouldRetryQuery,
      staleTime: QUERY_STALE_TIME_MS,
    },
  },
});
