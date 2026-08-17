import { QueryClient } from '@tanstack/react-query';

// Shared query/cache layer for backend-owned entities (sessions, session
// events, artworks, boards, artists). The backend is canonical: query data is
// a runtime cache, never durable truth. Optimistic overlays live outside the
// query results (e.g. the pending session-event overlay in useSessionState).
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Mutation flows invalidate explicitly; avoid surprise refetches that
        // the pre-query-layer code never performed.
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

export const queryKeys = {
  sessions: (userId: string) => ['sessions', userId] as const,
  sessionEventsRoot: () => ['session-events'] as const,
  sessionEvents: (sessionId: string) => ['session-events', sessionId] as const,
  artworks: (userId: string) => ['artworks', userId] as const,
  boards: (userId: string) => ['boards', userId] as const,
  artists: (userId: string) => ['artists', userId] as const,
  accountUsage: (userId: string) => ['account-usage', userId] as const,
};

const userScopedQueryKeys = (userId: string) => [
  queryKeys.sessions(userId),
  queryKeys.artworks(userId),
  queryKeys.boards(userId),
  queryKeys.artists(userId),
  queryKeys.accountUsage(userId),
];

export async function transitionUserQueryCache(
  queryClient: QueryClient,
  previousUserId: string,
  nextUserId: string,
): Promise<void> {
  if (previousUserId !== nextUserId) {
    await Promise.all(userScopedQueryKeys(previousUserId).map((queryKey) => (
      queryClient.cancelQueries({ queryKey, exact: true })
    )));
    userScopedQueryKeys(previousUserId).forEach((queryKey) => {
      queryClient.removeQueries({ queryKey, exact: true });
    });
  }

  await Promise.all(userScopedQueryKeys(nextUserId).map((queryKey) => (
    queryClient.invalidateQueries({ queryKey, exact: true })
  )));
}
