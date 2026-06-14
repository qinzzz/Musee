import { useEffect, useMemo, useState } from 'react';
import type { GalleryItem } from '../types';
import { fetchUserArtists, type ArtistRow } from '../api/artworks';

type CacheEntry = {
  data: ArtistRow[];
  invalidationKey: string;
};

const artistCache = new Map<string, CacheEntry>();
const inFlightArtistRequests = new Map<string, Promise<ArtistRow[]>>();

function buildArtistCacheKey(userId: string, invalidationKey: string): string {
  return `${userId}::${invalidationKey}`;
}

function loadArtists(userId: string, invalidationKey: string): Promise<ArtistRow[]> {
  const requestKey = buildArtistCacheKey(userId, invalidationKey);
  const existing = inFlightArtistRequests.get(requestKey);
  if (existing) return existing;

  const request = fetchUserArtists(userId)
    .then((data) => {
      artistCache.set(userId, { data, invalidationKey });
      return data;
    })
    .finally(() => {
      inFlightArtistRequests.delete(requestKey);
    });

  inFlightArtistRequests.set(requestKey, request);
  return request;
}

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

export function useUserArtists({
  userId,
  invalidationKey = 'default',
  enabled = true,
  prefetch = false,
}: UseUserArtistsOptions) {
  const cachedEntry = userId ? artistCache.get(userId) : undefined;
  const hasFreshCache = Boolean(cachedEntry && cachedEntry.invalidationKey === invalidationKey);

  const [artists, setArtists] = useState<ArtistRow[]>(() => (
    hasFreshCache ? cachedEntry!.data : []
  ));
  const [isLoading, setIsLoading] = useState<boolean>(() => enabled && !hasFreshCache);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setArtists([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const currentCache = artistCache.get(userId);
    const cacheIsFresh = Boolean(currentCache && currentCache.invalidationKey === invalidationKey);
    if (cacheIsFresh) {
      setArtists(currentCache!.data);
      setIsLoading(false);
      setError(null);
      return;
    } else if (!enabled && !prefetch) {
      return;
    } else if (enabled) {
      setIsLoading(artists.length === 0);
    }

    let cancelled = false;
    const shouldExposeErrors = enabled;
    loadArtists(userId, invalidationKey)
      .then((data) => {
        if (cancelled) return;
        setArtists(data);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (shouldExposeErrors) {
          setError(err instanceof Error ? err : new Error('Failed to load artists'));
        }
      })
      .finally(() => {
        if (cancelled) return;
        if (enabled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [artists.length, enabled, invalidationKey, prefetch, userId]);

  const refresh = useMemo(() => {
    return async () => {
      if (!userId) return;
      artistCache.delete(userId);
      setIsLoading(true);
      try {
        const data = await loadArtists(userId, invalidationKey);
        setArtists(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load artists'));
      } finally {
        setIsLoading(false);
      }
    };
  }, [invalidationKey, userId]);

  return {
    artists,
    isLoading,
    error,
    refresh,
  };
}
