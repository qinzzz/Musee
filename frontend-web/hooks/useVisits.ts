import { useEffect, useMemo, useState } from 'react';
import type { GalleryItem, Message } from '../types';

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
  items: GalleryItem[];
  artworksLoaded: boolean;
  deleteConfirmation: DeleteConfirmation;
  defaultVisitTitle: string;
  visitDraftsStorageKey: string;
  visitStreamsStorageKey: string;
  sessionGoalsStorageKey: string;
};

function getVisitItemTimestamp(item: GalleryItem): number {
  return item.sessionCapturedAt ?? item.timestamp;
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
  items,
  artworksLoaded,
  deleteConfirmation,
  defaultVisitTitle,
  visitDraftsStorageKey,
  visitStreamsStorageKey,
  sessionGoalsStorageKey,
}: UseVisitsOptions) {
  const [visitSearch, setVisitSearch] = useState('');
  const [filteredVisitId, setFilteredVisitId] = useState<string | null>(null);
  const [isComposingNewSession, setIsComposingNewSession] = useState(false);
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

  useEffect(() => {
    localStorage.setItem(visitDraftsStorageKey, JSON.stringify(visitDrafts));
  }, [visitDrafts, visitDraftsStorageKey]);

  useEffect(() => {
    localStorage.setItem(visitStreamsStorageKey, JSON.stringify(visitStreams));
  }, [visitStreams, visitStreamsStorageKey]);

  useEffect(() => {
    localStorage.setItem(sessionGoalsStorageKey, JSON.stringify(sessionGoals));
  }, [sessionGoals, sessionGoalsStorageKey]);

  const visitSummaries = useMemo(() => {
    const grouped = new Map<string, GalleryItem[]>();
    items.forEach((item) => {
      if (!item.visitId) return;
      if (!grouped.has(item.visitId)) grouped.set(item.visitId, []);
      grouped.get(item.visitId)!.push(item);
    });

    const summaries: VisitSummary[] = [];
    const knownIds = new Set<string>();

    grouped.forEach((visitItems, id) => {
      knownIds.add(id);
      const sortedItems = [...visitItems].sort((a, b) => getVisitItemTimestamp(a) - getVisitItemTimestamp(b));
      const latestItem = sortedItems[sortedItems.length - 1];
      const firstItem = sortedItems[0];
      const location = parseDisplayLocation(firstItem?.location || latestItem?.location);
      const title = latestItem?.sessionTitle || location || visitDrafts.find((draft) => draft.id === id)?.title || defaultVisitTitle;
      summaries.push({
        id,
        title,
        location,
        artworkCount: sortedItems.length,
        updatedAt: latestItem ? getVisitItemTimestamp(latestItem) : Date.now(),
        dateLabel: latestItem?.photoTime ? parseDisplayDate(latestItem.photoTime) : null,
        items: sortedItems,
      });
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
  }, [defaultVisitTitle, items, visitDrafts, visitSearch]);

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
    visitSummaries,
    activeVisitSummary,
    pendingDeleteVisitSummary,
    activeVisitStream,
  };
}
