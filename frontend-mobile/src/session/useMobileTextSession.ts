import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { SessionEventRecord, SessionRecord } from '@musee/client-core';

import { MOBILE_API_BASE_URL, mobileSessionService } from '../api/runtime';
import { mapMobileArtwork } from '../library/mobileArtworkLibraryService';
import type { MobileArtworkRecord } from '../library/types';
import { restoreTextSessionAttempt } from './mobileSessionService';
import { markOrphanedResponses, ORPHANED_RESPONSE_MESSAGE } from './sessionEventState';
import {
  presentSessionError,
  type SessionErrorPresentation,
} from './sessionErrorPresentation';
import {
  useMobileSessionMessaging,
  type MobileSessionMessagingController,
} from './useMobileSessionMessaging';

export type MobileTextSessionController = MobileSessionMessagingController & {
  artworks: MobileArtworkRecord[];
  events: SessionEventRecord[];
  isLoading: boolean;
  loadError: SessionErrorPresentation | null;
  reload: () => Promise<void>;
  session: SessionRecord | null;
  updateSession: (session: SessionRecord) => void;
};

const ERROR_OPTIONS = {
  apiBaseUrl: MOBILE_API_BASE_URL,
  showTechnicalDetails: __DEV__,
};
const SESSION_REVALIDATION_INTERVAL_MS = 15_000;

export function useMobileTextSession(
  routeSessionId: string,
  userId: string,
): MobileTextSessionController {
  const [events, setEvents] = useState<SessionEventRecord[]>([]);
  const [artworks, setArtworks] = useState<MobileArtworkRecord[]>([]);
  const [session, setSession] = useState<SessionRecord | null>(null);
  const [isLoading, setIsLoading] = useState(routeSessionId !== 'new');
  const [loadError, setLoadError] = useState<SessionErrorPresentation | null>(null);
  const requestVersion = useRef(0);
  const messaging = useMobileSessionMessaging({
    artworks,
    events,
    session,
    setArtworks,
    setEvents,
    setSession,
    userId,
  });
  const resetMessaging = messaging.reset;

  const reload = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoadError(null);
    resetMessaging();

    if (routeSessionId === 'new') {
      setSession(null);
      setEvents([]);
      setArtworks([]);
      setIsLoading(false);
      return;
    }

    if (!userId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [sessions, restoredEvents, restoredArtworks] = await Promise.all([
        mobileSessionService.fetchSessions(userId),
        mobileSessionService.fetchEvents(routeSessionId),
        mobileSessionService.fetchArtworks(routeSessionId, userId),
      ]);
      if (version !== requestVersion.current) return;
      const restoredSession = sessions.find((entry) => entry.id === routeSessionId);
      if (!restoredSession) throw new Error('Session not found.');

      const restored = markOrphanedResponses(restoredEvents);
      setSession(restoredSession);
      setEvents(restored.events);
      setArtworks(restoredArtworks.map((artwork) => (
        mapMobileArtwork(artwork, MOBILE_API_BASE_URL)
      )));

      restored.orphaned.forEach((responseEvent) => {
        const attempt = restoreTextSessionAttempt(
          responseEvent,
          restored.events,
          restoredSession,
          userId,
        );
        if (attempt) {
          void mobileSessionService.persistResponse(
            attempt,
            'failed',
            undefined,
            ORPHANED_RESPONSE_MESSAGE,
          ).catch(() => undefined);
        }
      });
    } catch (error) {
      if (version === requestVersion.current) {
        setLoadError(presentSessionError(error, 'load', ERROR_OPTIONS));
      }
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  }, [resetMessaging, routeSessionId, userId]);

  useEffect(() => {
    void reload();
    return () => {
      requestVersion.current += 1;
    };
  }, [reload]);

  // Refresh the canonical session snapshot on return without resetting an active conversation.
  const activeSessionId = session?.id;
  const isSending = messaging.isSending;
  useFocusEffect(useCallback(() => {
    if (!activeSessionId || !userId || isSending) return;
    let cancelled = false;
    let refreshing = false;
    const refreshCanonicalSession = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const [records, refreshedEvents, sessions] = await Promise.all([
          mobileSessionService.fetchArtworks(activeSessionId, userId),
          mobileSessionService.fetchEvents(activeSessionId),
          mobileSessionService.fetchSessions(userId),
        ]);
        if (cancelled) return;
        setLoadError(null);
        setArtworks(records.map((record) => mapMobileArtwork(record, MOBILE_API_BASE_URL)));
        setEvents(refreshedEvents);
        const updated = sessions.find((entry) => entry.id === activeSessionId);
        if (updated) setSession(updated);
      } catch (error) {
        if (!cancelled) setLoadError(presentSessionError(error, 'load', ERROR_OPTIONS));
      } finally {
        refreshing = false;
      }
    };
    void refreshCanonicalSession();
    const intervalId = setInterval(() => {
      void refreshCanonicalSession();
    }, SESSION_REVALIDATION_INTERVAL_MS);
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void refreshCanonicalSession();
    });
    return () => {
      cancelled = true;
      clearInterval(intervalId);
      appStateSubscription.remove();
    };
  }, [activeSessionId, isSending, userId]));

  return {
    ...messaging,
    updateSession: setSession,
    artworks,
    events,
    isLoading,
    loadError,
    reload,
    session,
  };
}
