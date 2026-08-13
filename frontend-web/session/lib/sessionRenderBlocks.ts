import type { GalleryItem } from '../../types';
import { getItemSequenceNumberForSession, getSessionItemTimestamp } from './sessionSelectors';
import { getDeletedArtworkReference, getSessionEventArtworkIds } from './sessionEventArtworks';
import { compareSessionEvents } from './sessionOrdering';
import type { SessionRenderBlock, SessionStreamMessage, SessionSummary } from '../types';
import { getArtworkClientId } from '../../lib/artworkIdentity';
import { isSessionFailureMessageKind } from './sessionFailureStatus';

function normalizeEventSource(source: unknown): 'library' | 'upload' | 'camera' {
  if (source === 'library' || source === 'upload' || source === 'camera') {
    return source;
  }
  if (source === 'capture') {
    return 'camera';
  }
  return 'camera';
}

function readArtworkEventSourceFromPayload(
  message: SessionStreamMessage,
  artworkId: string,
): 'library' | 'upload' | 'camera' | undefined {
  const artworks = Array.isArray(message.payload?.artworks) ? message.payload.artworks : [];
  const match = artworks.find((entry) => (
    entry
    && typeof entry === 'object'
    && 'artwork_id' in entry
    && entry.artwork_id === artworkId
  ));

  if (match && typeof match === 'object' && 'source' in match) {
    if (match.source === 'library' || match.source === 'upload' || match.source === 'camera' || match.source === 'capture') {
      return normalizeEventSource(match.source);
    }
  }

  const source = message.payload?.source;
  if (source === 'library' || source === 'upload' || source === 'camera' || source === 'capture') {
    return normalizeEventSource(source);
  }

  return undefined;
}

function buildDeletedArtworkPlaceholder(
  artworkId: string,
  sessionId: string,
  message: SessionStreamMessage,
): GalleryItem {
  const deletedReference = getDeletedArtworkReference(message, artworkId);
  return {
    id: `deleted-artwork-${artworkId}`,
    artworkId,
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
    sessionCapturedAt: message.createdAt,
    sessionLinks: [{
      sessionId,
      sequenceNumber: message.sequenceNumber,
      source: readArtworkEventSourceFromPayload(message, artworkId) ?? 'camera',
    }],
    conversation: [],
    artworkName: deletedReference?.artwork_name?.trim() || 'Deleted artwork',
    artistName: deletedReference?.artist_name?.trim() || undefined,
    date: deletedReference?.date?.trim() || undefined,
    syncStatus: 'synced',
    isDeletedPlaceholder: true,
  };
}

function getArtworkEventSourceForSession(
  item: GalleryItem,
  sessionId: string,
): 'library' | 'upload' | 'camera' {
  const sessionLink = item.sessionLinks?.find((link) => link.sessionId === sessionId);
  if (sessionLink?.source === 'library' || sessionLink?.source === 'upload' || sessionLink?.source === 'camera') {
    return sessionLink.source;
  }
  return 'camera';
}

function getArtworkGroupLabel(
  items: GalleryItem[],
  sessionId: string,
  message?: SessionStreamMessage,
): string {
  const count = items.length;
  const sources = Array.from(new Set(items.map((item) => (
    (message && readArtworkEventSourceFromPayload(
      message,
      item.artworkId || getArtworkClientId(item),
    ))
    ?? getArtworkEventSourceForSession(item, sessionId)
  ))));

  if (sources.length === 1) {
    switch (sources[0]) {
      case 'library':
        return count === 1 ? 'Added from collection' : `Added ${count} artworks from collection`;
      case 'upload':
        return count === 1 ? 'Uploaded an artwork' : `Uploaded ${count} artworks`;
      case 'camera':
      default:
        return count === 1 ? 'Captured an artwork' : `Captured ${count} artworks`;
    }
  }

  return count === 1 ? 'Added an artwork' : `Added ${count} artworks from multiple sources`;
}

function getCommentaryStatus(message: SessionStreamMessage): 'pending' | 'completed' | 'failed' {
  const status = message.payload?.status;
  if (status === 'failed' || status === 'completed' || status === 'pending') {
    return status;
  }
  return message.text ? 'completed' : 'pending';
}

export function buildSessionRenderBlocks(
  activeSessionSummary: SessionSummary | null,
  sessionStreams: Record<string, SessionStreamMessage[]>,
  options: { artworksLoaded?: boolean; allItems?: GalleryItem[] } = {},
): SessionRenderBlock[] {
  if (!activeSessionSummary) {
    return [];
  }

  const artworksLoaded = options.artworksLoaded ?? true;
  const sessionId = activeSessionSummary.id;
  // No need to pre-sort: blocks are sorted once at the end, and the build loop
  // is order-independent (used-item tracking is a Set).
  const messages = sessionStreams[sessionId] || [];

  const itemsByArtworkId = new Map<string, GalleryItem>();
  const itemsById = new Map<string, GalleryItem>();
  const resolutionItems = options.allItems ?? activeSessionSummary.items;
  resolutionItems.forEach((item) => {
    itemsById.set(getArtworkClientId(item), item);
    itemsById.set(item.id, item);
    if (item.artworkId) {
      itemsByArtworkId.set(item.artworkId, item);
    }
  });

  const resolveArtwork = (artworkId: string): GalleryItem | undefined => (
    itemsByArtworkId.get(artworkId) || itemsById.get(artworkId)
  );

  const usedItemIds = new Set<string>();
  const blocks: SessionRenderBlock[] = [];

  for (const message of messages) {
    if (message.type === 'artwork_capture' || message.type === 'artwork_card') {
      continue;
    }

    if (message.role === 'user') {
      const artworkIds = getSessionEventArtworkIds(message);
      const items = artworkIds
        .map((artworkId) => {
          const artwork = resolveArtwork(artworkId);
          if (artwork) return artwork;
          return artworksLoaded
            ? buildDeletedArtworkPlaceholder(artworkId, sessionId, message)
            : null;
        })
        .filter((item): item is GalleryItem => Boolean(item));

      items.forEach((item) => usedItemIds.add(getArtworkClientId(item)));

      // Only an artwork-bearing event becomes an "input" block (the artwork
      // chip + thumbnails). A text-only user message falls through to a plain
      // "message" block below, which renders as a chat bubble with no chip.
      if (items.length > 0) {
        blocks.push({
          type: 'input',
          id: message.id,
          createdAt: message.createdAt,
          sequenceNumber: message.sequenceNumber,
          localOrder: message.localOrder,
          items,
          sourceLabel: getArtworkGroupLabel(items, sessionId, message),
          userMessage: message.text ? message : undefined,
        });
        continue;
      }
    }

    if (message.type === 'model_response' || message.type === 'artwork_commentary') {
      blocks.push({
        type: 'commentary',
        id: message.id,
        createdAt: message.createdAt,
        sequenceNumber: message.sequenceNumber,
        localOrder: message.localOrder,
        message,
        status: getCommentaryStatus(message),
      });
      continue;
    }

    if (message.text && isSessionFailureMessageKind(message.payload?.message_kind)) {
      blocks.push({
        type: 'status',
        id: message.id,
        createdAt: message.createdAt,
        sequenceNumber: message.sequenceNumber,
        localOrder: message.localOrder,
        message: message.text,
        tone: 'failed',
      });
      continue;
    }

    if (message.text) {
      blocks.push({
        type: 'message',
        id: message.id,
        createdAt: message.createdAt,
        sequenceNumber: message.sequenceNumber,
        localOrder: message.localOrder,
        message,
      });
    }
  }

  const orphanItems = [...activeSessionSummary.items]
    .filter((item) => !usedItemIds.has(getArtworkClientId(item)))
    .sort((a, b) => {
      const aSequence = getItemSequenceNumberForSession(a, sessionId);
      const bSequence = getItemSequenceNumberForSession(b, sessionId);
      if (aSequence !== null && bSequence !== null && aSequence !== bSequence) {
        return aSequence - bSequence;
      }
      if (aSequence !== null && bSequence === null) return -1;
      if (aSequence === null && bSequence !== null) return 1;
      return getSessionItemTimestamp(a) - getSessionItemTimestamp(b);
    });

  // sequence_number is the authoritative order (the DB assigns it in event
  // order, so a reply always follows its trigger). Optimistic blocks have no
  // seq yet and sort after all persisted ones, by creation order — see
  // compareSessionEvents.
  const orderedBlocks = blocks.sort(compareSessionEvents);

  if (orphanItems.length > 0) {
    // Orphan artworks live in the session but aren't tied to any conversation
    // event (legacy sessions, or an event not yet loaded). They're ordered by a
    // different numbering (per-artwork index, not event sequence_number), so we
    // keep them OUT of the canonical sort and render them first as the session's
    // base contents — avoids mixing the two numbering spaces.
    orderedBlocks.unshift({
      type: 'artwork_group',
      id: `artwork-group-${sessionId}`,
      createdAt: orphanItems[0] ? getSessionItemTimestamp(orphanItems[0]) : Date.now(),
      items: orphanItems,
      sourceLabel: getArtworkGroupLabel(orphanItems, sessionId),
    });
  }

  return orderedBlocks;
}
