import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSessionEvents } from '../api/sessions';
import { queryKeys } from '../../lib/queryClient';

type UseSessionEventsQueryOptions = {
  sessionId: string | null | undefined;
  enabled?: boolean;
};

// Canonical session-event timeline, straight from the backend. Consumers merge
// the memory-only pending overlay on top of this (see useSessionWorkspace);
// the query result itself must stay pure backend truth. Cached data repaints a
// re-opened session instantly while the refetch confirms it.
export function useSessionEventsQuery({ sessionId, enabled = true }: UseSessionEventsQueryOptions) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.sessionEvents(sessionId || ''),
    queryFn: () => fetchSessionEvents(sessionId as string),
    enabled: Boolean(sessionId) && enabled,
  });

  const refreshSessionEvents = useCallback(() => {
    if (!sessionId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.sessionEvents(sessionId) });
  }, [queryClient, sessionId]);

  return {
    events: query.data,
    refreshSessionEvents,
  };
}
