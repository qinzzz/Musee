import type { GalleryItem, SessionLink } from '../../types';

export function getPrimarySessionLink(item: GalleryItem): SessionLink | undefined {
  return item.sessionLinks?.[0];
}

export function getPrimarySessionId(item: GalleryItem): string | undefined {
  return getPrimarySessionLink(item)?.sessionId;
}

export function getItemSessionIds(item: GalleryItem): string[] {
  if (item.sessionLinks && item.sessionLinks.length > 0) {
    return item.sessionLinks.map((link) => link.sessionId);
  }
  return [];
}

export function itemBelongsToSession(
  item: GalleryItem,
  sessionId: string | null | undefined,
): boolean {
  if (!sessionId) return false;
  return getItemSessionIds(item).includes(sessionId);
}

export function updateSessionLinkForItem(
  item: GalleryItem,
  sessionId: string,
  updater: (existing: SessionLink | undefined) => SessionLink | null,
): GalleryItem {
  const existingLinks = item.sessionLinks ? [...item.sessionLinks] : [];
  const existingIndex = existingLinks.findIndex((link) => link.sessionId === sessionId);
  const nextLink = updater(existingIndex >= 0 ? existingLinks[existingIndex] : undefined);

  if (nextLink === null) {
    const filteredLinks = existingLinks.filter((link) => link.sessionId !== sessionId);
    if (filteredLinks.length === 0 && !existingLinks.some((link) => link.sessionId === sessionId)) {
      return item;
    }
    return {
      ...item,
      sessionLinks: filteredLinks.length > 0 ? filteredLinks : undefined,
    };
  }

  if (existingIndex >= 0) {
    existingLinks[existingIndex] = nextLink;
  } else {
    existingLinks.push(nextLink);
  }

  return {
    ...item,
    sessionLinks: existingLinks,
  };
}

export function buildSessionLink(
  sessionId: string | undefined,
  sequenceNumber: number | undefined,
  source: SessionLink['source'],
): SessionLink[] | undefined {
  if (!sessionId) return undefined;
  return [
    {
      sessionId,
      sequenceNumber,
      source,
    },
  ];
}
