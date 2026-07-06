import { useEffect, useMemo, useState } from 'react';
import type { GalleryItem } from '../../types';
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
  sessionGoalsStorageKey: string;
  persistedSessionsStorageKey: string;
};

// Storage policy: the backend is canonical for session events; the DB fetch is
// the recovery mechanism after a reload. Session streams (canonical fetched
// events + the optimistic pending overlay) and pre-persist session drafts are
// therefore memory-only — persisting them would only create ghosts that
// contradict the fetch. These keys held them historically; clear them once.
const LEGACY_SESSION_STORAGE_KEYS = ['musee_session_streams', 'musee_session_drafts'];

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
  const {
    sessions: persistedSessions,
    sessionsHydrated: persistedSessionsHydrated,
    refreshSessions: refreshPersistedSessions,
  } = useSessionsQuery({
    userId,
    storageKey: persistedSessionsStorageKey,
  });

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
