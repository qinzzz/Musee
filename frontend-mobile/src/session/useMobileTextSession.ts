import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MOBILE_API_BASE_URL } from '../api/runtime';
import { markOrphanedResponses } from './sessionEventState';
import { presentSessionError } from './sessionErrorPresentation';
import { useMobileSessionMessaging } from './useMobileSessionMessaging';
import type { SessionSnapshot } from './mobileSessionExecution';
import { sessionKeys, sessionSnapshotQuery } from './sessionQueries';

const SESSION_REVALIDATION_INTERVAL_MS = 15_000;
export type MobileTextSessionController = ReturnType<typeof useMobileTextSession>;

export function useMobileTextSession(routeSessionId: string, userId: string) {
  const client = useQueryClient();
  const messaging = useMobileSessionMessaging(userId);
  const { reset, hydrate, session, isSending, failure } = messaging;
  const [focused, setFocused] = useState(false);
  const lastHydrated = useRef<SessionSnapshot | undefined>(undefined);
  const previousRoute = useRef({ id: routeSessionId, userId });
  const savedId = routeSessionId === 'new' ? session?.id : routeSessionId;
  const hasCurrentSession = session?.id === savedId && session?.user_id === userId;
  const query = useQuery({
    ...sessionSnapshotQuery(userId, savedId || 'new'),
    enabled: !!userId && !!savedId && focused && !isSending && !failure,
    refetchInterval: focused && !isSending && !failure ? SESSION_REVALIDATION_INTERVAL_MS : false,
  });

  useEffect(() => {
    const previous = previousRoute.current;
    previousRoute.current = { id: routeSessionId, userId };
    const promoted = previous.id === 'new' && previous.userId === userId && session?.id === routeSessionId;
    if ((previous.id !== routeSessionId || previous.userId !== userId) && !promoted) reset();
  }, [reset, routeSessionId, userId, session?.id]);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    if (userId && savedId) void client.invalidateQueries({ queryKey: sessionKeys.detail(userId, savedId) });
    return () => setFocused(false);
  }, [client, savedId, userId]));

  useEffect(() => {
    if (isSending && savedId) {
      void client.cancelQueries({ queryKey: sessionKeys.detail(userId, savedId) });
      void client.invalidateQueries({ queryKey: sessionKeys.detail(userId, savedId), refetchType: 'none' });
    }
  }, [client, isSending, savedId, userId]);

  useEffect(() => {
    if (!query.data || lastHydrated.current === query.data) return;
    lastHydrated.current = query.data;
    if (isSending || failure) return;
    const restored = markOrphanedResponses(query.data.events);
    hydrate({ ...query.data, events: restored.events });
  }, [hydrate, query.data, isSending, failure]);

  const reload = useCallback(async () => {
    if (isSending) return;
    reset({ session: messaging.session, events: messaging.events, artworks: messaging.artworks });
    if (savedId) await query.refetch();
  }, [isSending, reset, messaging.session, messaging.events, messaging.artworks, savedId, query.refetch]);

  return {
    ...messaging,
    reload,
    // Promoting a new route must not hide the conversation while its first read finishes.
    isLoading: routeSessionId !== 'new' && !hasCurrentSession && !query.data && query.isPending,
    loadError: query.error ? presentSessionError(query.error, 'load', {
      apiBaseUrl: MOBILE_API_BASE_URL, showTechnicalDetails: __DEV__,
    }) : null,
  };
}
