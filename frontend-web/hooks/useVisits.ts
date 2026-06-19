import { useEffect, useMemo, useState } from 'react';
import type { GalleryItem, Message } from '../types';
import { fetchSessions, type SessionRecord } from '../api/sessions';

export type VisitStreamMessage = Message & {
  id: string;
  createdAt: number;
  type?: 'text' | 'artwork_capture' | 'artwork_card';
  artworkId?: string;
};

export type VisitDraft = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type VisitSummary = {
  id: string;
  title: string;
  location: string | null;
  artworkCount: number;
  updatedAt: number;
  dateLabel: string | null;
  items: GalleryItem[];
};

export type ActiveVisitStreamEntry =
  | {
      id: string;
      createdAt: number;
      type: 'artwork';
      item: GalleryItem;
    }
  | {
      id: string;
      createdAt: number;
      type: 'message';
      message: VisitStreamMessage;
    };

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

function getVisitItemTimestamp(item: GalleryItem): number {
  return item.sessionCapturedAt ?? item.timestamp;
}

function getItemSessionMemberships(item: GalleryItem): Array<{
  visitId: string;
  title?: string;
  sequenceNumber?: number;
  source?: 'library' | 'upload' | 'camera';
}> {
  if (item.sessionLinks && item.sessionLinks.length > 0) {
    return item.sessionLinks
      .filter((link) => Boolean(link.sessionId))
      .map((link) => ({
        visitId: link.sessionId,
        title: link.sessionTitle,
        sequenceNumber: link.sequenceNumber,
        source: link.source,
      }));
  }

  if (item.visitId) {
    return [{ visitId: item.visitId, title: item.sessionTitle }];
  }

  return [];
}

function getItemSequenceNumberForVisit(item: GalleryItem, visitId: string): number | null {
  const link = item.sessionLinks?.find((entry) => entry.sessionId === visitId);
  if (typeof link?.sequenceNumber === 'number') {
    return link.sequenceNumber;
  }
  return null;
}

function parseDisplayLocation(loc: unknown): string | null {
  if (!loc) return null;
  try {
    const data = typeof loc === 'object' ? loc : (typeof loc === 'string' && loc.startsWith('{') ? JSON.parse(loc) : null);
    if (data) {
      const parts: string[] = [];
      if (data.museum) parts.push(data.museum);
      if (data.city) parts.push(data.city);
      else if (data.country) parts.push(data.country);
      return parts.join(', ') || null;
    }
    return typeof loc === 'string' ? loc : null;
  } catch {
    return typeof loc === 'string' ? loc : null;
  }
}

function parseDisplayDate(dateStr: string): string {
  try {
    const dt = new Date(dateStr);
    if (!Number.isNaN(dt.getTime())) {
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

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
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPersistedSessions([]);
        }
      });

    return () => {
      cancelled = true;
    };
  };

  useEffect(() => {
    return refreshPersistedSessions();
  }, [userId]);

  const visitSummaries = useMemo(() => {
    const grouped = new Map<string, GalleryItem[]>();
    const persistedSessionMap = new Map(persistedSessions.map((session) => [session.id, session]));
    items.forEach((item) => {
      const memberships = getItemSessionMemberships(item);
      memberships.forEach(({ visitId }) => {
        if (!grouped.has(visitId)) grouped.set(visitId, []);
        grouped.get(visitId)!.push(item);
      });
    });

    const summaries: VisitSummary[] = [];
    const knownIds = new Set<string>();

    grouped.forEach((visitItems, id) => {
      knownIds.add(id);
      const draft = visitDrafts.find((entry) => entry.id === id);
      const persistedSession = persistedSessionMap.get(id);
      const persistedUpdatedAt = persistedSession?.updated_at ? new Date(persistedSession.updated_at).getTime() : 0;
      const sortedItems = [...visitItems].sort((a, b) => {
        const aSequence = getItemSequenceNumberForVisit(a, id);
        const bSequence = getItemSequenceNumberForVisit(b, id);
        if (aSequence !== null && bSequence !== null && aSequence !== bSequence) {
          return aSequence - bSequence;
        }
        if (aSequence !== null && bSequence === null) return -1;
        if (aSequence === null && bSequence !== null) return 1;
        return getVisitItemTimestamp(a) - getVisitItemTimestamp(b);
      });
      const latestItem = sortedItems[sortedItems.length - 1];
      const firstItem = sortedItems[0];
      const location = parseDisplayLocation(firstItem?.location || latestItem?.location);
      const linkedTitle = latestItem?.sessionLinks?.find((link) => link.sessionId === id)?.sessionTitle;
      const title = persistedSession?.title || linkedTitle || latestItem?.sessionTitle || draft?.title || location || defaultVisitTitle;
      const lastArtworkTimestamp = latestItem ? getVisitItemTimestamp(latestItem) : 0;
      const updatedAt = Math.max(draft?.updatedAt || 0, persistedUpdatedAt, lastArtworkTimestamp);
      summaries.push({
        id,
        title,
        location,
        artworkCount: sortedItems.length,
        updatedAt: updatedAt || Date.now(),
        dateLabel: draft
          ? new Date(draft.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : (latestItem?.photoTime ? parseDisplayDate(latestItem.photoTime) : null),
        items: sortedItems,
      });
    });

    persistedSessions.forEach((session) => {
      if (knownIds.has(session.id)) return;
      const persistedUpdatedAt = session.updated_at ? new Date(session.updated_at).getTime() : Date.now();
      const draft = visitDrafts.find((entry) => entry.id === session.id);
      summaries.push({
        id: session.id,
        title: session.title || draft?.title || defaultVisitTitle,
        location: null,
        artworkCount: 0,
        updatedAt: Math.max(persistedUpdatedAt, draft?.updatedAt || 0),
        dateLabel: new Date(Math.max(persistedUpdatedAt, draft?.updatedAt || persistedUpdatedAt)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        items: [],
      });
      knownIds.add(session.id);
    });

    visitDrafts.forEach((draft) => {
      if (knownIds.has(draft.id)) return;
      summaries.push({
        id: draft.id,
        title: draft.title || defaultVisitTitle,
        location: null,
        artworkCount: 0,
        updatedAt: draft.updatedAt,
        dateLabel: new Date(draft.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        items: [],
      });
    });

    const search = visitSearch.trim().toLowerCase();
    return summaries
      .filter((summary) => {
        if (!search) return true;
        return summary.title.toLowerCase().includes(search) || (summary.location || '').toLowerCase().includes(search);
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [defaultVisitTitle, items, persistedSessions, visitDrafts, visitSearch]);

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
    if (!activeVisitSummary) return [];
    const messages = visitStreams[activeVisitSummary.id] || [];
    const itemsByArtworkId = new Map<string, GalleryItem>();
    const itemsById = new Map<string, GalleryItem>();

    activeVisitSummary.items.forEach((item) => {
      itemsById.set(item.id, item);
      if (item.artworkId) {
        itemsByArtworkId.set(item.artworkId, item);
      }
    });

    const captureTimeByArtworkId = new Map<string, number>();
    for (const message of messages) {
      if (message.type === 'artwork_capture' && message.artworkId) {
        captureTimeByArtworkId.set(message.artworkId, message.createdAt);
      }
    }

    const artworkEntries: ActiveVisitStreamEntry[] = activeVisitSummary.items.map((item) => ({
      id: `artwork-${item.id}`,
      createdAt: (item.artworkId && captureTimeByArtworkId.get(item.artworkId)) || getVisitItemTimestamp(item),
      type: 'artwork',
      item,
    }));

    const deletedArtworkEntries: ActiveVisitStreamEntry[] = messages
      .filter(() => artworksLoaded)
      .filter((message) => message.type === 'artwork_card' && message.artworkId)
      .filter((message) => {
        const artworkId = message.artworkId!;
        return !itemsByArtworkId.has(artworkId) && !itemsById.has(artworkId);
      })
      .map((message) => ({
        id: `deleted-artwork-${message.artworkId}`,
        createdAt: captureTimeByArtworkId.get(message.artworkId!) || message.createdAt,
        type: 'artwork' as const,
        item: {
          id: `deleted-artwork-${message.artworkId}`,
          artworkId: message.artworkId,
          url: '',
          keywords: [],
          vibe: {
            backgroundColor: '#ffffff',
            padding: 4,
            borderRadius: '12px',
            borderType: 'solid',
            accentColor: '#000000',
          },
          timestamp: message.createdAt,
          sessionCapturedAt: captureTimeByArtworkId.get(message.artworkId!) || message.createdAt,
          conversation: [],
          artworkName: 'Deleted artwork',
          syncStatus: 'synced',
          isDeletedPlaceholder: true,
        },
      }));

    const messageEntries: ActiveVisitStreamEntry[] = messages
      .filter((message) => message.type !== 'artwork_capture' && message.type !== 'artwork_card')
      .map((message) => ({
        id: message.id,
        createdAt: message.createdAt,
        type: 'message',
        message,
      }));

    return [...artworkEntries, ...deletedArtworkEntries, ...messageEntries].sort((a, b) => a.createdAt - b.createdAt);
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
    visitSummaries,
    activeVisitSummary,
    pendingDeleteVisitSummary,
    activeVisitStream,
    refreshPersistedSessions,
  };
}
