import { useEffect, useMemo, useState } from 'react';
import type { GalleryItem } from '../../types';
import { fetchSessions, type SessionRecord } from '../api/sessions';
import {
  buildActiveVisitStream,
  buildVisitSummaries,
} from '../lib/visitSelectors';
import type {
  ActiveVisitStreamEntry,
  VisitDraft,
  VisitSummary,
  VisitStreamMessage,
} from '../types';

type DeleteConfirmation = { id: string; type: 'item' | 'session' } | null;

type UseVisitsOptions = {
  userId: string;
  items: GalleryItem[];
  artworksLoaded: boolean;
  deleteConfirmation: DeleteConfirmation;
  defaultVisitTitle: string;
  initialIsComposingNewSession?: boolean;
  visitDraftsStorageKey: string;
  visitStreamsStorageKey: string;
  sessionGoalsStorageKey: string;
};

export function useVisits({
  userId,
  items,
  artworksLoaded,
  deleteConfirmation,
  defaultVisitTitle,
  initialIsComposingNewSession = false,
  visitDraftsStorageKey,
  visitStreamsStorageKey,
  sessionGoalsStorageKey,
}: UseVisitsOptions) {
  const [visitSearch, setVisitSearch] = useState('');
  const [filteredVisitId, setFilteredVisitId] = useState<string | null>(null);
  const [isComposingNewSession, setIsComposingNewSession] = useState(initialIsComposingNewSession);
  const [openVisitMenuId, setOpenVisitMenuId] = useState<string | null>(null);
  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [editingVisitTitle, setEditingVisitTitle] = useState('');
  const [visitDrafts, setVisitDrafts] = useState<VisitDraft[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(visitDraftsStorageKey) || '[]');
    } catch {
      return [];
    }
  });
  const [visitStreams, setVisitStreams] = useState<Record<string, VisitStreamMessage[]>>(() => {
    try {
      return JSON.parse(localStorage.getItem(visitStreamsStorageKey) || '{}');
    } catch {
      return {};
    }
  });
  const [streamingVisitResponses, setStreamingVisitResponses] = useState<Record<string, string>>({});
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
    localStorage.setItem(visitDraftsStorageKey, JSON.stringify(visitDrafts));
  }, [visitDrafts, visitDraftsStorageKey]);

  useEffect(() => {
    localStorage.setItem(visitStreamsStorageKey, JSON.stringify(visitStreams));
  }, [visitStreams, visitStreamsStorageKey]);

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
          setPersistedSessions([]);
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

  const visitSummaries = useMemo(() => {
    return buildVisitSummaries({
      items,
      persistedSessions,
      persistedSessionsHydrated,
      visitDrafts,
      defaultVisitTitle,
      visitSearch,
    });
  }, [defaultVisitTitle, items, persistedSessions, persistedSessionsHydrated, visitDrafts, visitSearch]);

  const activeVisitSummary = useMemo(() => {
    if (isComposingNewSession) {
      return {
        id: '',
        title: defaultVisitTitle,
        location: null,
        artworkCount: 0,
        updatedAt: Date.now(),
        dateLabel: null,
        items: [],
      };
    }

    return visitSummaries.find((summary) => summary.id === filteredVisitId) || visitSummaries[0] || null;
  }, [defaultVisitTitle, filteredVisitId, isComposingNewSession, visitSummaries]);

  const pendingDeleteVisitSummary = useMemo(() => {
    if (!deleteConfirmation || deleteConfirmation.type !== 'session') return null;
    return visitSummaries.find((summary) => summary.id === deleteConfirmation.id) || null;
  }, [deleteConfirmation, visitSummaries]);

  const activeVisitStream = useMemo<ActiveVisitStreamEntry[]>(() => {
    return buildActiveVisitStream({
      activeVisitSummary,
      artworksLoaded,
      visitStreams,
    });
  }, [activeVisitSummary, artworksLoaded, visitStreams]);

  useEffect(() => {
    if (isComposingNewSession) return;
    if (filteredVisitId && visitSummaries.some((summary) => summary.id === filteredVisitId)) return;
    setFilteredVisitId(visitSummaries[0]?.id || null);
  }, [filteredVisitId, isComposingNewSession, visitSummaries]);

  return {
    visitSearch,
    setVisitSearch,
    filteredVisitId,
    setFilteredVisitId,
    isComposingNewSession,
    setIsComposingNewSession,
    openVisitMenuId,
    setOpenVisitMenuId,
    editingVisitId,
    setEditingVisitId,
    editingVisitTitle,
    setEditingVisitTitle,
    visitDrafts,
    setVisitDrafts,
    visitStreams,
    setVisitStreams,
    streamingVisitResponses,
    setStreamingVisitResponses,
    sessionGoalDismissed,
    setSessionGoalDismissed,
    sessionGoalInput,
    setSessionGoalInput,
    sessionGoals,
    setSessionGoals,
    persistedSessions,
    persistedSessionsHydrated,
    visitSummaries,
    activeVisitSummary,
    pendingDeleteVisitSummary,
    activeVisitStream,
    refreshPersistedSessions,
  };
}
