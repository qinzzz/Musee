import type { GalleryItem } from '../../types';
import { getItemSequenceNumberForSession, getSessionItemTimestamp } from './sessionSelectors';
import { getSessionEventArtworkIds } from './sessionEventArtworks';
import type { SessionRenderBlock, SessionStreamMessage, SessionSummary } from '../types';

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

function getArtworkGroupLabel(items: GalleryItem[], sessionId: string): string {
  const count = items.length;
  const sources = Array.from(new Set(items.map((item) => getArtworkEventSourceForSession(item, sessionId))));

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

function sortByCanonicalOrder<T extends { sequenceNumber?: number; createdAt: number; id: string }>(a: T, b: T): number {
  if (
    typeof a.sequenceNumber === 'number'
    && typeof b.sequenceNumber === 'number'
    && a.sequenceNumber !== b.sequenceNumber
  ) {
    return a.sequenceNumber - b.sequenceNumber;
  }
  if (typeof a.sequenceNumber === 'number' && typeof b.sequenceNumber !== 'number') {
    return -1;
  }
  if (typeof a.sequenceNumber !== 'number' && typeof b.sequenceNumber === 'number') {
    return 1;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt - b.createdAt;
  }
  return a.id.localeCompare(b.id);
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
): SessionRenderBlock[] {
  if (!activeSessionSummary) {
    return [];
  }

  const sessionId = activeSessionSummary.id;
  const messages = [...(sessionStreams[sessionId] || [])].sort(sortByCanonicalOrder);

  const itemsByArtworkId = new Map<string, GalleryItem>();
  const itemsById = new Map<string, GalleryItem>();
  activeSessionSummary.items.forEach((item) => {
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
        .map(resolveArtwork)
        .filter((item): item is GalleryItem => Boolean(item));

      items.forEach((item) => usedItemIds.add(item.id));

      if (items.length > 0 || message.text) {
        blocks.push({
          type: 'input',
          id: message.id,
          createdAt: message.createdAt,
          sequenceNumber: message.sequenceNumber,
          triggerEventId: message.triggerEventId || message.id,
          items,
          sourceLabel: items.length > 0 ? getArtworkGroupLabel(items, sessionId) : 'Message',
          userMessage: message.text ? message : undefined,
        });
        continue;
      }
    }

    if (message.type === 'artwork_commentary') {
      blocks.push({
        type: 'commentary',
        id: message.id,
        createdAt: message.createdAt,
        sequenceNumber: message.sequenceNumber,
        triggerEventId: message.triggerEventId,
        message,
        status: getCommentaryStatus(message),
      });
      continue;
    }

    if (message.text) {
      blocks.push({
        type: 'message',
        id: message.id,
        createdAt: message.createdAt,
        sequenceNumber: message.sequenceNumber,
        message,
      });
    }
  }

  const orphanItems = [...activeSessionSummary.items]
    .filter((item) => !usedItemIds.has(item.id))
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

  if (orphanItems.length > 0) {
    blocks.push({
      type: 'artwork_group',
      id: `artwork-group-${sessionId}`,
      createdAt: orphanItems[0] ? getSessionItemTimestamp(orphanItems[0]) : Date.now(),
      sequenceNumber: getItemSequenceNumberForSession(orphanItems[0], sessionId) ?? undefined,
      items: orphanItems,
      sourceLabel: getArtworkGroupLabel(orphanItems, sessionId),
    });
  }

  return blocks.sort(sortByCanonicalOrder);
}
