import type { GalleryItem, SessionLink } from '../../types';

export function getItemSessionIds(item: GalleryItem): string[] {
  if (item.sessionLinks && item.sessionLinks.length > 0) {
    return item.sessionLinks.map((link) => link.sessionId);
  }
  return item.visitId ? [item.visitId] : [];
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
    if (filteredLinks.length === 0 && item.visitId !== sessionId) {
      return item;
    }
    return {
      ...item,
      sessionLinks: filteredLinks.length > 0 ? filteredLinks : undefined,
      visitId: item.visitId === sessionId ? undefined : item.visitId,
      sessionTitle: item.visitId === sessionId ? undefined : item.sessionTitle,
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
    visitId: item.visitId || sessionId,
    sessionTitle: item.sessionTitle || nextLink.sessionTitle,
  };
}

export function buildSessionLink(
  sessionId: string | undefined,
  sessionTitle: string | undefined,
  sequenceNumber: number | undefined,
  source: SessionLink['source'],
): SessionLink[] | undefined {
  if (!sessionId) return undefined;
  return [
    {
      sessionId,
      sessionTitle,
      sequenceNumber,
      source,
    },
  ];
}
