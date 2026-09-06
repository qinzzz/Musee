import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { MobileArtworkPage, MobileArtworkRecord } from './types';

export const ARTWORK_LIBRARY_PAGE_SIZE = 30;

export type ArtworkLibraryQueryData = InfiniteData<MobileArtworkPage, number>;

export function artworkLibraryQueryKey(userId: string) {
  return ['artwork-library', userId] as const;
}

export function getNextArtworkPageParam(lastPage: MobileArtworkPage): number | undefined {
  const nextOffset = lastPage.offset + lastPage.items.length;
  return lastPage.items.length > 0 && nextOffset < lastPage.total
    ? nextOffset
    : undefined;
}

export function flattenArtworkLibraryPages(
  data: ArtworkLibraryQueryData | undefined,
): MobileArtworkRecord[] {
  const seen = new Set<string>();
  return data?.pages.flatMap((page) => page.items.filter((artwork) => {
    if (seen.has(artwork.id)) return false;
    seen.add(artwork.id);
    return true;
  })) ?? [];
}

export function invalidateArtworkLibraryQuery(queryClient: QueryClient, userId: string): void {
  void queryClient.invalidateQueries({
    exact: true,
    queryKey: artworkLibraryQueryKey(userId),
    refetchType: 'none',
  });
}

export function updateArtworkLibraryQuery(
  queryClient: QueryClient,
  userId: string,
  artwork: MobileArtworkRecord,
): void {
  queryClient.setQueryData<ArtworkLibraryQueryData>(
    artworkLibraryQueryKey(userId),
    (current) => current ? {
      ...current,
      pages: current.pages.map((page) => ({
        ...page,
        items: page.items.map((item) => item.id === artwork.id ? artwork : item),
      })),
    } : current,
  );
}

export function removeArtworkFromLibraryQuery(
  queryClient: QueryClient,
  userId: string,
  artworkId: string,
): void {
  queryClient.setQueryData<ArtworkLibraryQueryData>(
    artworkLibraryQueryKey(userId),
    (current) => {
      if (!current?.pages.some((page) => page.items.some((item) => item.id === artworkId))) {
        return current;
      }
      return {
        ...current,
        pages: current.pages.map((page) => ({
          ...page,
          items: page.items.filter((item) => item.id !== artworkId),
          total: Math.max(0, page.total - 1),
        })),
      };
    },
  );
  invalidateArtworkLibraryQuery(queryClient, userId);
}
