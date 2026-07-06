import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSessions, updateSession, type SessionRecord } from '../api/sessions';
import { queryKeys } from '../../lib/queryClient';

type CachedPersistedSessionsPayload = {
  userId: string;
  sessions: SessionRecord[];
};

function readCachedPersistedSessions(
  storageKey: string,
  userId: string,
): SessionRecord[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CachedPersistedSessionsPayload | SessionRecord[];
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed.userId !== userId || !Array.isArray(parsed.sessions)) {
      return [];
    }
    return parsed.sessions;
  } catch {
    return [];
  }
}

type UseSessionsQueryOptions = {
  userId: string;
  storageKey: string;
};

// Canonical session records live in the backend; this query is the runtime
// cache. The localStorage snapshot is paint-only: it seeds the first render
// via placeholderData and is replaced wholesale by every successful fetch.
export function useSessionsQuery({ userId, storageKey }: UseSessionsQueryOptions) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.sessions(userId),
    queryFn: () => fetchSessions(userId),
    placeholderData: () => readCachedPersistedSessions(storageKey, userId),
  });

  useEffect(() => {
    // Write-through only for real backend data — a failed fetch keeps showing
    // the placeholder and must not overwrite the last good snapshot.
    if (query.isPlaceholderData || !query.data) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        userId,
        sessions: query.data,
      }));
    } catch {
      // Ignore storage quota/private browsing failures.
    }
  }, [query.data, query.isPlaceholderData, storageKey, userId]);

  const refreshSessions = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.sessions(userId) });
  }, [queryClient, userId]);

  // Optimistic rename: paint the new title into the cached list immediately,
  // confirm against the backend, then invalidate so canonical data reconciles.
  // On failure the snapshot is restored and the error propagates to the caller.
  const renameSession = useCallback(async (sessionId: string, title: string) => {
    const key = queryKeys.sessions(userId);
    await queryClient.cancelQueries({ queryKey: key });
    const previous = queryClient.getQueryData<SessionRecord[]>(key);
    queryClient.setQueryData<SessionRecord[]>(key, (prev) => (prev ?? []).map((session) => (
      session.id === sessionId ? { ...session, title } : session
    )));
    try {
      await updateSession(sessionId, userId, title);
      void queryClient.invalidateQueries({ queryKey: key });
    } catch (error) {
      queryClient.setQueryData(key, previous);
      throw error;
    }
  }, [queryClient, userId]);

  // Optimistic goal update: patch the cached record's metadata so the goal
  // paints immediately. The caller PATCHes the backend and invalidates; the
  // refetch is canonical either way (a failed PATCH honestly reverts).
  const setSessionGoalLocally = useCallback((sessionId: string, goal: string) => {
    queryClient.setQueryData<SessionRecord[]>(queryKeys.sessions(userId), (prev) => (prev ?? []).map((session) => (
      session.id === sessionId
        ? { ...session, metadata: { ...(session.metadata || {}), user_goal: goal } }
        : session
    )));
  }, [queryClient, userId]);

  return {
    sessions: query.data ?? [],
    renameSession,
    setSessionGoalLocally,
    // True once the first fetch settles (success or error); until then the UI
    // is painting the snapshot and should treat the list as provisional.
    sessionsHydrated: query.isFetched,
    refreshSessions,
  };
}
