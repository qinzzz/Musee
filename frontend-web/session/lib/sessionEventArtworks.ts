type ArtworkPayloadEntry = {
  artwork_id?: string | null;
};

type SessionEventLike = {
  artworkId?: string | null;
  artwork_id?: string | null;
  artworkIds?: string[] | null;
  artwork_ids?: string[] | null;
  payload?: Record<string, unknown> | null;
};

function normalizeArtworkIds(values: Array<string | null | undefined>): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  values.forEach((value) => {
    const candidate = value?.trim();
    if (!candidate || seen.has(candidate)) {
      return;
    }
    seen.add(candidate);
    normalized.push(candidate);
  });
  return normalized;
}

export function getSessionEventArtworkIds(event: SessionEventLike): string[] {
  const directIds = normalizeArtworkIds([
    event.artworkId ?? undefined,
    event.artwork_id ?? undefined,
    ...((event.artworkIds || event.artwork_ids || []) ?? []),
  ]);

  const payload = event.payload;
  if (!payload || typeof payload !== 'object') {
    return directIds;
  }

  const payloadArtworkIds = Array.isArray(payload.artwork_ids)
    ? normalizeArtworkIds(payload.artwork_ids as Array<string | null | undefined>)
    : [];
  if (payloadArtworkIds.length > 0) {
    return payloadArtworkIds;
  }

  const payloadArtworks = Array.isArray(payload.artworks)
    ? normalizeArtworkIds(
        (payload.artworks as ArtworkPayloadEntry[])
          .map((entry) => (entry && typeof entry === 'object' ? entry.artwork_id ?? undefined : undefined)),
      )
    : [];

  return payloadArtworks.length > 0 ? payloadArtworks : directIds;
}

export function getPrimarySessionEventArtworkId(event: SessionEventLike): string | undefined {
  return getSessionEventArtworkIds(event)[0];
}
