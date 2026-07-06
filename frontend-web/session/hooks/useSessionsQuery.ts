import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSessions, type SessionRecord } from '../api/sessions';
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

  return {
    sessions: query.data ?? [],
    // True once the first fetch settles (success or error); until then the UI
    // is painting the snapshot and should treat the list as provisional.
    sessionsHydrated: query.isFetched,
    refreshSessions,
  };
}
