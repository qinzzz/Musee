import { useEffect } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { MOBILE_API_BASE_URL } from '../api/runtime';
import { presentRequestError } from '../api/requestErrorPresentation';
import { artworkListQuery } from './artworkQueries';
import { artworkLibraryQueryKey, flattenArtworkLibraryPages } from './artworkLibraryQuery';

export function useArtworkPicker(userId: string, visible: boolean) {
  const client = useQueryClient();
  const query = useInfiniteQuery({ ...artworkListQuery(userId), enabled: !!userId && visible });
  useEffect(() => {
    if (visible && userId) void client.invalidateQueries({ queryKey: artworkLibraryQueryKey(userId) });
  }, [client, userId, visible]);
  return {
    items: flattenArtworkLibraryPages(query.data),
    isLoading: query.isPending && query.isFetching,
    isLoadingMore: query.isFetchingNextPage,
    error: query.error ? presentRequestError(query.error, {
      apiBaseUrl: MOBILE_API_BASE_URL, fallbackMessage: 'Musee could not load your library.', showTechnicalDetails: __DEV__,
    }) : null,
    reload: async () => { await query.refetch(); },
    loadMore: async () => { if (query.hasNextPage && !query.isFetching) await query.fetchNextPage(); },
  };
}
