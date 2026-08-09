import type { GalleryItem } from '../../types';

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
