import type { GalleryItem } from '../../types';
import type { SessionStreamMessage } from '../types';
import { nextLocalOrder } from './sessionOrdering';

export type ArtworkInputSource = 'upload' | 'capture' | 'library';

export function deriveArtworkInputSource(item: GalleryItem, sessionId: string): ArtworkInputSource {
  const link = item.sessionLinks?.find((sessionLink) => sessionLink.sessionId === sessionId);
  if (link?.source === 'library') return 'library';
  if (link?.source === 'camera') return 'capture';
  return 'upload';
}

// The per-artwork entries carried by a batch's canonical user_input event.
export function buildArtworkInputEntries(
  items: GalleryItem[],
  sessionId: string,
): Array<{ artworkId: string; source: ArtworkInputSource }> {
  return items
    .map((item) => ({
      artworkId: item.artworkId || item.id,
      source: deriveArtworkInputSource(item, sessionId),
    }))
    .filter((entry) => entry.artworkId);
}

// Local-only optimistic capture/card pairs for a batch of artwork rows.
// Persistence happens via the batch's canonical user_input event.
export function buildArtworkRowEvents(
  sessionId: string,
  artworkIds: string[],
  parentEventId: string,
  startCreatedAt: number,
): SessionStreamMessage[] {
  const events: SessionStreamMessage[] = [];
  let createdAtCursor = startCreatedAt;
  artworkIds.forEach((artworkId) => {
    events.push(
      { id: `capture-${sessionId}-${artworkId}`, role: 'user', text: '', type: 'artwork_capture', artworkId, triggerEventId: parentEventId, createdAt: createdAtCursor++, localOrder: nextLocalOrder() },
      { id: `card-${sessionId}-${artworkId}`, role: 'model', text: '', type: 'artwork_card', artworkId, triggerEventId: parentEventId, createdAt: createdAtCursor++, localOrder: nextLocalOrder() },
    );
  });
  return events;
}
