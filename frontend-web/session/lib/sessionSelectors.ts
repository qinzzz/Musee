import type { GalleryItem } from '../../types';
import type { SessionRecord } from '../api/sessions';
import type {
  ActiveSessionStreamEntry,
  SessionDraft,
  SessionSummary,
  SessionStreamMessage,
} from '../types';

type SessionMembership = {
  sessionId: string;
  sequenceNumber?: number;
  source?: 'library' | 'upload' | 'camera';
};

export function getSessionItemTimestamp(item: GalleryItem): number {
  return item.sessionCapturedAt ?? item.timestamp;
}

export function getItemSessionMemberships(item: GalleryItem): SessionMembership[] {
  if (item.sessionLinks && item.sessionLinks.length > 0) {
    return item.sessionLinks
      .filter((link) => Boolean(link.sessionId))
      .map((link) => ({
        sessionId: link.sessionId,
        sequenceNumber: link.sequenceNumber,
        source: link.source,
      }));
  }

  return [];
}

export function getItemSequenceNumberForSession(item: GalleryItem, sessionId: string): number | null {
  const link = item.sessionLinks?.find((entry) => entry.sessionId === sessionId);
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

type BuildSessionSummariesOptions = {
  items: GalleryItem[];
  persistedSessions: SessionRecord[];
  persistedSessionsHydrated: boolean;
  sessionDrafts?: SessionDraft[];
  defaultSessionTitle?: string;
  sessionSearch?: string;
};

export function buildSessionSummaries({
  items,
  persistedSessions,
  persistedSessionsHydrated,
  sessionDrafts,
  defaultSessionTitle,
  sessionSearch,
}: BuildSessionSummariesOptions): SessionSummary[] {
  const resolvedSessionDrafts = sessionDrafts ?? [];
  const resolvedDefaultSessionTitle = defaultSessionTitle ?? 'Untitled Session';
  const resolvedSessionSearch = sessionSearch ?? '';
  const grouped = new Map<string, GalleryItem[]>();
  const persistedSessionMap = new Map(persistedSessions.map((session) => [session.id, session]));

  items.forEach((item) => {
    const memberships = getItemSessionMemberships(item);
    memberships.forEach(({ sessionId }) => {
      if (!grouped.has(sessionId)) grouped.set(sessionId, []);
      grouped.get(sessionId)!.push(item);
    });
  });

  const summaries: SessionSummary[] = [];
  const knownIds = new Set<string>();

  grouped.forEach((sessionItems, id) => {
    knownIds.add(id);
    const draft = resolvedSessionDrafts.find((entry) => entry.id === id);
    const persistedSession = persistedSessionMap.get(id);
    const persistedUpdatedAt = persistedSession?.updated_at ? new Date(persistedSession.updated_at).getTime() : 0;
    const sortedItems = [...sessionItems].sort((a, b) => {
      const aSequence = getItemSequenceNumberForSession(a, id);
      const bSequence = getItemSequenceNumberForSession(b, id);
      if (aSequence !== null && bSequence !== null && aSequence !== bSequence) {
        return aSequence - bSequence;
      }
      if (aSequence !== null && bSequence === null) return -1;
      if (aSequence === null && bSequence !== null) return 1;
      return getSessionItemTimestamp(a) - getSessionItemTimestamp(b);
    });

    const latestItem = sortedItems[sortedItems.length - 1];
    const firstItem = sortedItems[0];
    const location = parseDisplayLocation(firstItem?.location || latestItem?.location);
    const resolvedTitle =
      persistedSession?.title ||
      draft?.title ||
      location ||
      null;
    const titlePending = !persistedSessionsHydrated && !resolvedTitle;
    const title = resolvedTitle || resolvedDefaultSessionTitle;
    const lastArtworkTimestamp = latestItem ? getSessionItemTimestamp(latestItem) : 0;
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
    const draft = resolvedSessionDrafts.find((entry) => entry.id === session.id);
    summaries.push({
      id: session.id,
      title: session.title || draft?.title || resolvedDefaultSessionTitle,
      titlePending: false,
      location: null,
      artworkCount: 0,
      updatedAt: Math.max(persistedUpdatedAt, draft?.updatedAt || 0),
      dateLabel: new Date(Math.max(persistedUpdatedAt, draft?.updatedAt || persistedUpdatedAt)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      items: [],
    });
    knownIds.add(session.id);
  });

  resolvedSessionDrafts.forEach((draft) => {
    if (knownIds.has(draft.id)) return;
    summaries.push({
      id: draft.id,
      title: draft.title || resolvedDefaultSessionTitle,
      titlePending: false,
      location: null,
      artworkCount: 0,
      updatedAt: draft.updatedAt,
      dateLabel: new Date(draft.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      items: [],
    });
  });

  const search = resolvedSessionSearch.trim().toLowerCase();
  return summaries
    .filter((summary) => {
      if (!search) return true;
      return summary.title.toLowerCase().includes(search) || (summary.location || '').toLowerCase().includes(search);
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

type BuildActiveSessionStreamOptions = {
  activeSessionSummary: SessionSummary | null;
  artworksLoaded: boolean;
  sessionStreams: Record<string, SessionStreamMessage[]>;
};

export function buildActiveSessionStream({
  activeSessionSummary,
  artworksLoaded,
  sessionStreams,
}: BuildActiveSessionStreamOptions): ActiveSessionStreamEntry[] {
  if (!activeSessionSummary) return [];

  const messages = sessionStreams[activeSessionSummary.id] || [];
  const itemsByArtworkId = new Map<string, GalleryItem>();
  const itemsById = new Map<string, GalleryItem>();

  activeSessionSummary.items.forEach((item) => {
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

  const artworkEntries: ActiveSessionStreamEntry[] = activeSessionSummary.items.map((item) => ({
    id: `artwork-${item.id}`,
    createdAt: (item.artworkId && captureTimeByArtworkId.get(item.artworkId)) || getSessionItemTimestamp(item),
    type: 'artwork',
    item,
  }));

  const deletedArtworkEntries: ActiveSessionStreamEntry[] = messages
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

  const messageEntries: ActiveSessionStreamEntry[] = messages
    .filter((message) => message.type !== 'artwork_capture' && message.type !== 'artwork_card')
    .map((message) => ({
      id: message.id,
      createdAt: message.createdAt,
      type: 'message',
      message,
    }));

  return [...artworkEntries, ...deletedArtworkEntries, ...messageEntries].sort((a, b) => a.createdAt - b.createdAt);
}
