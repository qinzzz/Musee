import type { SessionEventRecord } from '@musee/client-core';

import type { MobileArtworkRecord } from '../library/types';

type ArtworkSource = 'camera' | 'library' | 'upload';

export type SessionArtworkGroup = {
  artworks: MobileArtworkRecord[];
  eventId: string | null;
  id: string;
  label: string;
  unavailableArtworkIds: string[];
};

export type SessionArtworkPresentation = {
  eventGroups: Record<string, SessionArtworkGroup>;
  orphanGroup: SessionArtworkGroup | null;
};

function normalizeArtworkIds(values: unknown[]): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    if (typeof value !== 'string') return [];
    const artworkId = value.trim();
    if (!artworkId || seen.has(artworkId)) return [];
    seen.add(artworkId);
    return [artworkId];
  });
}

export function getSessionEventArtworkIds(event: SessionEventRecord): string[] {
  const directIds = normalizeArtworkIds([
    event.artwork_id,
    ...(event.artwork_ids || []),
  ]);
  const payloadIds = Array.isArray(event.payload?.artwork_ids)
    ? normalizeArtworkIds(event.payload.artwork_ids)
    : [];
  if (payloadIds.length > 0) return payloadIds;

  const payloadArtworks = Array.isArray(event.payload?.artworks)
    ? event.payload.artworks
    : [];
  const artworkEntryIds = normalizeArtworkIds(payloadArtworks.map((entry) => (
    entry && typeof entry === 'object' && 'artwork_id' in entry
      ? entry.artwork_id
      : null
  )));
  return artworkEntryIds.length > 0 ? artworkEntryIds : directIds;
}

function normalizeSource(value: unknown): ArtworkSource | null {
  if (value === 'capture') return 'camera';
  return value === 'camera' || value === 'library' || value === 'upload'
    ? value
    : null;
}

function getEventArtworkSources(event: SessionEventRecord): ArtworkSource[] {
  const payloadArtworks = Array.isArray(event.payload?.artworks)
    ? event.payload.artworks
    : [];
  const sources = payloadArtworks.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || !('source' in entry)) return [];
    const source = normalizeSource(entry.source);
    return source ? [source] : [];
  });
  const payloadSource = normalizeSource(event.payload?.source);
  if (payloadSource) sources.push(payloadSource);
  return [...new Set(sources)];
}

function getEventArtworkLabel(event: SessionEventRecord, count: number): string {
  const sources = getEventArtworkSources(event);
  if (sources.length !== 1) return count === 1 ? 'Added an artwork' : `Added ${count} artworks`;
  switch (sources[0]) {
    case 'library':
      return count === 1 ? 'Added from library' : `Added ${count} artworks from library`;
    case 'upload':
      return count === 1 ? 'Uploaded an artwork' : `Uploaded ${count} artworks`;
    case 'camera':
      return count === 1 ? 'Captured an artwork' : `Captured ${count} artworks`;
  }
}

export function buildSessionArtworkPresentation(
  events: SessionEventRecord[],
  artworks: MobileArtworkRecord[],
): SessionArtworkPresentation {
  const artworkById = new Map(
    artworks
      .filter((artwork) => !artwork.isDeleted)
      .map((artwork) => [artwork.id, artwork]),
  );
  const presentedArtworkIds = new Set<string>();
  const eventGroups: Record<string, SessionArtworkGroup> = {};

  events.forEach((event) => {
    const artworkIds = getSessionEventArtworkIds(event).filter(
      (artworkId) => !presentedArtworkIds.has(artworkId),
    );
    if (artworkIds.length === 0) return;
    artworkIds.forEach((artworkId) => presentedArtworkIds.add(artworkId));
    eventGroups[event.id] = {
      id: `event-artworks-${event.id}`,
      eventId: event.id,
      label: getEventArtworkLabel(event, artworkIds.length),
      artworks: artworkIds.flatMap((artworkId) => {
        const artwork = artworkById.get(artworkId);
        return artwork ? [artwork] : [];
      }),
      unavailableArtworkIds: artworkIds.filter((artworkId) => !artworkById.has(artworkId)),
    };
  });

  const orphanArtworks = artworks.filter((artwork) => (
    !artwork.isDeleted && !presentedArtworkIds.has(artwork.id)
  ));
  return {
    eventGroups,
    orphanGroup: orphanArtworks.length > 0
      ? {
          id: 'session-artworks-unlinked',
          eventId: null,
          label: orphanArtworks.length === 1 ? 'Session artwork' : 'Session artworks',
          artworks: orphanArtworks,
          unavailableArtworkIds: [],
        }
      : null,
  };
}
