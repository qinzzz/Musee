import { useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { GalleryItem } from '../../types';
import { fetchUserArtists, type ArtistRow } from '../../api/artworks';
import { queryKeys } from '../../lib/queryClient';

// Fingerprints the artwork list; when it changes the artist rollups are stale.
export function buildArtistInvalidationKey(items: GalleryItem[]): string {
  return items
    .filter((item) => !item.isDeletedPlaceholder)
    .map((item) => [
      item.artworkId || item.id,
      item.artistEntityId || '',
      item.artistName || '',
      item.analysisStatus || '',
    ].join(':'))
    .join('|');
}

interface UseUserArtistsOptions {
  userId?: string | null;
  invalidationKey?: string;
  enabled?: boolean;
  prefetch?: boolean;
}

// Artists are backend-owned; the shared query cache replaces the old
// module-level Map + in-flight dedupe. `prefetch` warms the cache without
// exposing loading/error state; `invalidationKey` changes trigger a background
// refetch while the previous list stays rendered.
export function useUserArtists({
  userId,
  invalidationKey = 'default',
  enabled = true,
  prefetch = false,
}: UseUserArtistsOptions) {
  const queryClient = useQueryClient();
  const shouldFetch = Boolean(userId) && (enabled || prefetch);

  const query = useQuery({
    queryKey: queryKeys.artists(userId || ''),
    queryFn: () => fetchUserArtists(userId as string),
    enabled: shouldFetch,
  });

  const lastInvalidationKeyRef = useRef(invalidationKey);
  useEffect(() => {
    if (lastInvalidationKeyRef.current === invalidationKey) return;
    lastInvalidationKeyRef.current = invalidationKey;
    if (userId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.artists(userId) });
    }
  }, [invalidationKey, queryClient, userId]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    await queryClient.refetchQueries({ queryKey: queryKeys.artists(userId) });
  }, [queryClient, userId]);

  return {
    artists: query.data ?? [],
    isLoading: enabled && shouldFetch && query.isPending,
    error: enabled ? ((query.error as Error | null) ?? null) : null,
    refresh,
  };
}
