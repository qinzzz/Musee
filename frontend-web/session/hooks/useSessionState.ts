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
  sessionDraftsStorageKey: string;
  sessionStreamsStorageKey: string;
  sessionGoalsStorageKey: string;
};

function normalizeCachedSessionStreams(
  raw: Record<string, Array<SessionStreamMessage & { turnId?: string }>>,
): Record<string, SessionStreamMessage[]> {
  return Object.fromEntries(
    Object.entries(raw).map(([sessionId, entries]) => [
      sessionId,
      (entries || []).map((entry) => {
        const isCanonicalUserInputMessage =
          entry.role === 'user'
          && Boolean(entry.text)
          && (entry.type === 'text' || entry.type === undefined || entry.type === 'artwork_capture');
        return {
          ...entry,
          type: isCanonicalUserInputMessage ? 'text' : entry.type,
          triggerEventId:
            entry.triggerEventId
            || entry.turnId
            || (isCanonicalUserInputMessage ? entry.id : undefined),
        };
      }),
    ]),
  );
}

export function useSessionState({
  userId,
  items,
  artworksLoaded,
  deleteConfirmation,
  defaultSessionTitle,
  initialIsComposingNewSession = false,
  sessionDraftsStorageKey,
  sessionStreamsStorageKey,
  sessionGoalsStorageKey,
}: UseSessionStateOptions) {
  const [sessionSearch, setSessionSearch] = useState('');
  const [filteredSessionId, setFilteredSessionId] = useState<string | null>(null);
  const [isComposingNewSession, setIsComposingNewSession] = useState(initialIsComposingNewSession);
  const [openSessionMenuId, setOpenSessionMenuId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState('');
  const [sessionDrafts, setSessionDrafts] = useState<SessionDraft[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(sessionDraftsStorageKey) || '[]');
    } catch {
      return [];
    }
  });
  const [sessionStreams, setSessionStreams] = useState<Record<string, SessionStreamMessage[]>>(() => {
    try {
      return normalizeCachedSessionStreams(
        JSON.parse(localStorage.getItem(sessionStreamsStorageKey) || '{}'),
      );
    } catch {
      return {};
    }
  });
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
  const [persistedSessions, setPersistedSessions] = useState<SessionRecord[]>([]);
  const [persistedSessionsHydrated, setPersistedSessionsHydrated] = useState(false);

  useEffect(() => {
    localStorage.setItem(sessionDraftsStorageKey, JSON.stringify(sessionDrafts));
  }, [sessionDrafts, sessionDraftsStorageKey]);

  useEffect(() => {
    localStorage.setItem(sessionStreamsStorageKey, JSON.stringify(sessionStreams));
  }, [sessionStreams, sessionStreamsStorageKey]);

  useEffect(() => {
    localStorage.setItem(sessionGoalsStorageKey, JSON.stringify(sessionGoals));
  }, [sessionGoals, sessionGoalsStorageKey]);

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
    setPersistedSessions([]);
    setPersistedSessionsHydrated(false);
    return refreshPersistedSessions();
  }, [userId]);

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
