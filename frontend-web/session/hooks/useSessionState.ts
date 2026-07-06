import { useEffect, useMemo, useState } from 'react';
import type { GalleryItem } from '../../types';
import { fetchSessions, type SessionRecord } from '../api/sessions';
import {
  buildActiveSessionStream,
  buildSessionSummaries,
} from '../lib/sessionSelectors';
import { buildSessionRenderBlocks } from '../lib/sessionRenderBlocks';
import type {
  ActiveSessionStreamEntry,
  SessionRenderBlock,
  SessionDraft,
  SessionSummary,
  SessionStreamMessage,
} from '../types';

type DeleteConfirmation = { id: string; type: 'item' | 'session' } | null;

type UseSessionStateOptions = {
  userId: string;
  items: GalleryItem[];
  artworksLoaded: boolean;
  deleteConfirmation: DeleteConfirmation;
  defaultSessionTitle: string;
  initialIsComposingNewSession?: boolean;
  sessionGoalsStorageKey: string;
  persistedSessionsStorageKey: string;
};

// Storage policy: the backend is canonical for session events; the DB fetch is
// the recovery mechanism after a reload. Session streams (canonical fetched
// events + the optimistic pending overlay) and pre-persist session drafts are
// therefore memory-only — persisting them would only create ghosts that
// contradict the fetch. These keys held them historically; clear them once.
const LEGACY_SESSION_STORAGE_KEYS = ['musee_session_streams', 'musee_session_drafts'];

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

export function useSessionState({
  userId,
  items,
  artworksLoaded,
  deleteConfirmation,
  defaultSessionTitle,
  initialIsComposingNewSession = false,
  sessionGoalsStorageKey,
  persistedSessionsStorageKey,
}: UseSessionStateOptions) {
  const [sessionSearch, setSessionSearch] = useState('');
  const [filteredSessionId, setFilteredSessionId] = useState<string | null>(null);
  const [isComposingNewSession, setIsComposingNewSession] = useState(initialIsComposingNewSession);
  const [openSessionMenuId, setOpenSessionMenuId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState('');
  // Memory-only: provisional UI state until the first persisted commit.
  const [sessionDrafts, setSessionDrafts] = useState<SessionDraft[]>([]);
  // Memory-only: canonical fetched events + optimistic pending overlay, merged
  // per session. Reload recovery is the DB fetch, never local storage.
  const [sessionStreams, setSessionStreams] = useState<Record<string, SessionStreamMessage[]>>({});
  const [streamingSessionResponses, setStreamingSessionResponses] = useState<Record<string, string>>({});
  const [sessionGoalDismissed, setSessionGoalDismissed] = useState<Set<string>>(new Set());
  const [sessionGoalInput, setSessionGoalInput] = useState('');
  const [sessionGoals, setSessionGoals] = useState<Record<string, string>>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(sessionGoalsStorageKey) || '{}');
      const { '': _dropped, ...clean } = raw;
      return clean;
    } catch {
      return {};
    }
  });
  const [persistedSessions, setPersistedSessions] = useState<SessionRecord[]>(() => (
    readCachedPersistedSessions(persistedSessionsStorageKey, userId)
  ));
  const [persistedSessionsHydrated, setPersistedSessionsHydrated] = useState(false);

  useEffect(() => {
    // One-time cleanup of the retired stream/draft persistence.
    try {
      LEGACY_SESSION_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch {
      // Ignore storage failures (private browsing etc.).
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(sessionGoalsStorageKey, JSON.stringify(sessionGoals));
  }, [sessionGoals, sessionGoalsStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(persistedSessionsStorageKey, JSON.stringify({
        userId,
        sessions: persistedSessions,
      }));
    } catch {
      // Ignore storage quota/private browsing failures.
    }
  }, [persistedSessions, persistedSessionsStorageKey, userId]);

  const refreshPersistedSessions = () => {
    let cancelled = false;

    fetchSessions(userId)
      .then((sessions) => {
        if (!cancelled) {
          setPersistedSessions(sessions);
          setPersistedSessionsHydrated(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPersistedSessionsHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  };

  useEffect(() => {
    setPersistedSessions(readCachedPersistedSessions(persistedSessionsStorageKey, userId));
    setPersistedSessionsHydrated(false);
    return refreshPersistedSessions();
  }, [persistedSessionsStorageKey, userId]);

  const sessionSummaries = useMemo(() => {
    return buildSessionSummaries({
      items,
      persistedSessions,
      persistedSessionsHydrated,
      sessionDrafts,
      defaultSessionTitle,
      sessionSearch,
    });
  }, [defaultSessionTitle, items, persistedSessions, persistedSessionsHydrated, sessionDrafts, sessionSearch]);

  const activeSessionSummary = useMemo(() => {
    if (isComposingNewSession) {
      return {
        id: '',
        title: defaultSessionTitle,
        location: null,
        artworkCount: 0,
        updatedAt: Date.now(),
        dateLabel: null,
        items: [],
      };
    }

    return sessionSummaries.find((summary) => summary.id === filteredSessionId) || sessionSummaries[0] || null;
  }, [defaultSessionTitle, filteredSessionId, isComposingNewSession, sessionSummaries]);

  const pendingDeleteSessionSummary = useMemo(() => {
    if (!deleteConfirmation || deleteConfirmation.type !== 'session') return null;
    return sessionSummaries.find((summary) => summary.id === deleteConfirmation.id) || null;
  }, [deleteConfirmation, sessionSummaries]);

  const activeSessionStream = useMemo<ActiveSessionStreamEntry[]>(() => {
    return buildActiveSessionStream({
      activeSessionSummary,
      artworksLoaded,
      sessionStreams,
    });
  }, [activeSessionSummary, artworksLoaded, sessionStreams]);

  const activeSessionRenderBlocks = useMemo<SessionRenderBlock[]>(() => {
    return buildSessionRenderBlocks(activeSessionSummary, sessionStreams);
  }, [activeSessionSummary, sessionStreams]);

  useEffect(() => {
    if (isComposingNewSession) return;
    if (filteredSessionId && sessionSummaries.some((summary) => summary.id === filteredSessionId)) return;
    setFilteredSessionId(sessionSummaries[0]?.id || null);
  }, [filteredSessionId, isComposingNewSession, sessionSummaries]);

  return {
    sessionSearch,
    setSessionSearch,
    filteredSessionId,
    setFilteredSessionId,
    isComposingNewSession,
    setIsComposingNewSession,
    openSessionMenuId,
    setOpenSessionMenuId,
    editingSessionId,
    setEditingSessionId,
    editingSessionTitle,
    setEditingSessionTitle,
    sessionDrafts,
    setSessionDrafts,
    sessionStreams,
    setSessionStreams,
    streamingSessionResponses,
    setStreamingSessionResponses,
    sessionGoalDismissed,
    setSessionGoalDismissed,
    sessionGoalInput,
    setSessionGoalInput,
    sessionGoals,
    setSessionGoals,
    persistedSessions,
    persistedSessionsHydrated,
    sessionSummaries,
    activeSessionSummary,
    pendingDeleteSessionSummary,
    activeSessionStream,
    activeSessionRenderBlocks,
    refreshPersistedSessions,
  };
}
