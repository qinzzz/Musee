import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchUserArtworks } from '../../api/artworks';
import { queryKeys } from '../../lib/queryClient';
import { mapArtworkRecordToGalleryItem } from '../lib/artworkMapping';
import type { GalleryItem } from '../../types';

export const ARTWORKS_STALE_TIME_MS = 60_000;

export function shouldRefreshArtworks(dataUpdatedAt: number, now = Date.now()): boolean {
  return dataUpdatedAt === 0 || now - dataUpdatedAt >= ARTWORKS_STALE_TIME_MS;
}

// Canonical artwork list, straight from the backend. Consumers merge the
// local overlay (unsynced uploads, in-flight client state) on top via
// mergeServerItemsWithLocalItems; the query result itself stays pure backend
// truth. The bootstrap localStorage cache remains the paint layer and is
// owned by useArtworkLibrary, not this query.
export function useArtworksQuery(userId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.artworks(userId),
    queryFn: async (): Promise<GalleryItem[]> => {
      const data = await fetchUserArtworks(userId);
      const records = Array.isArray(data?.items) ? data.items : [];
      return records.map(mapArtworkRecordToGalleryItem);
    },
    staleTime: ARTWORKS_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // Safe to call after any server-confirmed mutation: the reconcile merge
  // preserves in-flight client state, so a refetch can't clobber the UI.
  const refreshArtworks = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.artworks(userId) });
  }, [queryClient, userId]);

  const refreshArtworksIfStale = useCallback(() => {
    if (!shouldRefreshArtworks(query.dataUpdatedAt)) return;
    void query.refetch();
  }, [query.dataUpdatedAt, query.refetch]);

  return {
    serverItems: query.data,
    refreshArtworks,
    refreshArtworksIfStale,
    // True once the first fetch settles (success or error); mirrors the old
    // artworksLoaded flag that gated session summaries and loading states.
    artworksLoaded: query.isFetched,
    artworksError: query.error,
  };
}
