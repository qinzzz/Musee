import type { GalleryItem } from '../../types';
import type { SessionRecord } from '../api/sessions';
import type { ActiveVisitStreamEntry, VisitDraft, VisitSummary, VisitStreamMessage } from '../types';

type SessionMembership = {
  visitId: string;
  title?: string;
  sequenceNumber?: number;
  source?: 'library' | 'upload' | 'camera';
};

export function getVisitItemTimestamp(item: GalleryItem): number {
  return item.sessionCapturedAt ?? item.timestamp;
}

export function getItemSessionMemberships(item: GalleryItem): SessionMembership[] {
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

export function getItemSequenceNumberForVisit(item: GalleryItem, visitId: string): number | null {
  const link = item.sessionLinks?.find((entry) => entry.sessionId === visitId);
  if (typeof link?.sequenceNumber === 'number') {
    return link.sequenceNumber;
  }
  return null;
}

export function parseDisplayLocation(loc: unknown): string | null {
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

export function parseDisplayDate(dateStr: string): string {
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

type BuildVisitSummariesOptions = {
  items: GalleryItem[];
  persistedSessions: SessionRecord[];
  persistedSessionsHydrated: boolean;
  visitDrafts: VisitDraft[];
  defaultVisitTitle: string;
  visitSearch: string;
};

export function buildVisitSummaries({
  items,
  persistedSessions,
  persistedSessionsHydrated,
  visitDrafts,
  defaultVisitTitle,
  visitSearch,
}: BuildVisitSummariesOptions): VisitSummary[] {
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
    const resolvedTitle =
      persistedSession?.title ||
      linkedTitle ||
      latestItem?.sessionTitle ||
      draft?.title ||
      location ||
      null;
    const titlePending = !persistedSessionsHydrated && !resolvedTitle;
    const title = resolvedTitle || defaultVisitTitle;
    const lastArtworkTimestamp = latestItem ? getVisitItemTimestamp(latestItem) : 0;
    const updatedAt = Math.max(draft?.updatedAt || 0, persistedUpdatedAt, lastArtworkTimestamp);

    summaries.push({
      id,
      title,
      titlePending,
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
      titlePending: false,
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
      titlePending: false,
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
}

type BuildActiveVisitStreamOptions = {
  activeVisitSummary: VisitSummary | null;
  artworksLoaded: boolean;
  visitStreams: Record<string, VisitStreamMessage[]>;
};

export function buildActiveVisitStream({
  activeVisitSummary,
  artworksLoaded,
  visitStreams,
}: BuildActiveVisitStreamOptions): ActiveVisitStreamEntry[] {
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
}
