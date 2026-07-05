import type { GalleryItem } from '../../types';
import { getItemSequenceNumberForSession, getSessionItemTimestamp } from './sessionSelectors';
import { getSessionEventArtworkIds } from './sessionEventArtworks';
import { compareSessionEvents } from './sessionOrdering';
import type { SessionRenderBlock, SessionStreamMessage, SessionSummary } from '../types';
import { getArtworkClientId } from '../../lib/artworkIdentity';

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
  // No need to pre-sort: blocks are sorted once at the end, and the build loop
  // is order-independent (used-item tracking is a Set).
  const messages = sessionStreams[sessionId] || [];

  const itemsByArtworkId = new Map<string, GalleryItem>();
  const itemsById = new Map<string, GalleryItem>();
  activeSessionSummary.items.forEach((item) => {
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
        .map(resolveArtwork)
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
          sourceLabel: getArtworkGroupLabel(items, sessionId),
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
        localOrder: message.localOrder,
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
