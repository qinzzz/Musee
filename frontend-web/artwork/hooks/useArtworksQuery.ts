import { useQuery } from '@tanstack/react-query';
import { fetchUserArtworks } from '../../api/artworks';
import { queryKeys } from '../../lib/queryClient';
import { mapArtworkRecordToGalleryItem } from '../lib/artworkMapping';
import type { GalleryItem } from '../../types';

// Canonical artwork list, straight from the backend. Consumers merge the
// local overlay (unsynced uploads, in-flight client state) on top via
// mergeServerItemsWithLocalItems; the query result itself stays pure backend
// truth. The bootstrap localStorage cache remains the paint layer and is
// owned by useArtworkLibrary, not this query.
export function useArtworksQuery(userId: string) {
  const query = useQuery({
    queryKey: queryKeys.artworks(userId),
    queryFn: async (): Promise<GalleryItem[]> => {
      const data = await fetchUserArtworks(userId);
      const records = Array.isArray(data?.items) ? data.items : [];
      return records.map(mapArtworkRecordToGalleryItem);
    },
  });

  return {
    serverItems: query.data,
    // True once the first fetch settles (success or error); mirrors the old
    // artworksLoaded flag that gated session summaries and loading states.
    artworksLoaded: query.isFetched,
    artworksError: query.error,
  };
}
