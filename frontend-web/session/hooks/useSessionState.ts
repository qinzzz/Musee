import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GalleryItem } from '../../types';
import type { SessionRecord } from '../api/sessions';
import { useSessionsQuery } from './useSessionsQuery';
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

import type { DeleteConfirmationState } from '../../app-shell/components/AppConfirmationLayer';

type DeleteConfirmation = DeleteConfirmationState;

type UseSessionStateOptions = {
  userId: string;
  items: GalleryItem[];
  artworksLoaded: boolean;
  deleteConfirmation: DeleteConfirmation;
  defaultSessionTitle: string;
  initialIsComposingNewSession?: boolean;
  persistedSessionsStorageKey: string;
};

// Storage policy: the backend is canonical for session events, goals, and
// titles; the DB fetch is the recovery mechanism after a reload. Session
// streams (canonical fetched events + the optimistic pending overlay),
// pre-persist session drafts, and goal overrides are therefore memory-only —
// persisting them would only create ghosts that contradict the fetch. These
// keys held them historically; clear them once.
const LEGACY_SESSION_STORAGE_KEYS = [
  'musee_session_streams',
  'musee_session_drafts',
  'musee_session_goals',
];

function readServerSessionGoals(sessions: SessionRecord[]): Record<string, string> {
  const goals: Record<string, string> = {};
  sessions.forEach((session) => {
    const goal = (session.metadata as Record<string, unknown> | null | undefined)?.user_goal;
    if (typeof goal === 'string' && goal.trim()) {
      goals[session.id] = goal;
    }
  });
  return goals;
}

export function useSessionState({
  userId,
  items,
  artworksLoaded,
  deleteConfirmation,
  defaultSessionTitle,
  initialIsComposingNewSession = false,
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
  // Memory-only goals for sessions that don't exist in the backend yet
  // (pre-persist drafts). Persisted-session goals live on the session record
  // (metadata.user_goal) and are optimistically patched into the query cache.
  const [draftSessionGoals, setDraftSessionGoals] = useState<Record<string, string>>({});
  const {
    sessions: persistedSessions,
    sessionsHydrated: persistedSessionsHydrated,
    refreshSessions: refreshPersistedSessions,
    renameSession: renamePersistedSession,
    setSessionGoalLocally,
  } = useSessionsQuery({
    userId,
    storageKey: persistedSessionsStorageKey,
  });

  useEffect(() => {
    // One-time cleanup of the retired stream/draft/goal persistence.
    try {
      LEGACY_SESSION_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    } catch {
      // Ignore storage failures (private browsing etc.).
    }
  }, []);

  const serverSessionGoals = useMemo(
    () => readServerSessionGoals(persistedSessions),
    [persistedSessions],
  );

  // Server precedence: a backend goal always wins, so a local draft-goal can
  // never mask a change made on another device. Draft goals only fill in for
  // sessions the backend doesn't know yet.
  const sessionGoals = useMemo(
    () => ({ ...draftSessionGoals, ...serverSessionGoals }),
    [draftSessionGoals, serverSessionGoals],
  );

  const setSessionGoal = useCallback((sessionId: string, goal: string) => {
    if (persistedSessions.some((session) => session.id === sessionId)) {
      // Optimistic paint into the query cache; the caller PATCHes the backend
      // and invalidates, and the refetch reconciles either way.
      setSessionGoalLocally(sessionId, goal);
      return;
    }
    setDraftSessionGoals((prev) => ({ ...prev, [sessionId]: goal }));
  }, [persistedSessions, setSessionGoalLocally]);

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
    return buildSessionRenderBlocks(activeSessionSummary, sessionStreams, { artworksLoaded });
  }, [activeSessionSummary, artworksLoaded, sessionStreams]);

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
    setSessionGoal,
    persistedSessions,
    persistedSessionsHydrated,
    renamePersistedSession,
    sessionSummaries,
    activeSessionSummary,
    pendingDeleteSessionSummary,
    activeSessionStream,
    activeSessionRenderBlocks,
    refreshPersistedSessions,
  };
}
