import { throwIfRequestCancelled } from '../api/requestCancellation';
import { infiniteQueryOptions, queryOptions, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { mobileArtworkLibraryService } from '../api/runtime';
import { ARTWORK_LIBRARY_PAGE_SIZE, artworkLibraryQueryKey, getNextArtworkPageParam, invalidateArtworkLibraryQuery, updateArtworkLibraryQuery } from './artworkLibraryQuery';
import type { MobileArtworkPage, MobileArtworkRecord } from './types';

export const artworkDetailKey = (userId: string, id: string) => ['artwork-detail', userId, id] as const;
export function artworkDetailQuery(userId: string, id: string) {
  return queryOptions({
    queryKey: artworkDetailKey(userId, id),
    queryFn: async ({ signal }) => {
      const artwork = await mobileArtworkLibraryService.fetchArtwork(id);
      throwIfRequestCancelled(signal);
      return artwork;
    },
    enabled: !!userId && !!id,
  });
}
export function artworkListQuery(userId: string) {
  return infiniteQueryOptions<MobileArtworkPage, Error, InfiniteData<MobileArtworkPage, number>, ReturnType<typeof artworkLibraryQueryKey>, number>({
    queryKey: artworkLibraryQueryKey(userId),
    queryFn: async ({ pageParam, signal }) => {
      const page = await mobileArtworkLibraryService.fetchPage(userId, pageParam, ARTWORK_LIBRARY_PAGE_SIZE);
      throwIfRequestCancelled(signal);
      return page;
    },
    initialPageParam: 0,
    getNextPageParam: getNextArtworkPageParam,
    enabled: !!userId,
  });
}
export function cacheArtwork(client: QueryClient, userId: string, artwork: MobileArtworkRecord) {
  client.setQueryData(artworkDetailKey(userId, artwork.id), artwork);
  updateArtworkLibraryQuery(client, userId, artwork);
  invalidateArtworkLibraryQuery(client, userId);
}
