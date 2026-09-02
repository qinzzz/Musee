import {
  fetchArtworkById,
  fetchArtworkPage,
  type ApiClient,
  type ArtworkRecord,
} from '@musee/client-core';

import type { PendingArtworkUpload } from '../capture/types';
import { resolveRemoteImageUrl } from '../platform/images/resolveRemoteImageUrl';
import type { MobileArtworkPage, MobileArtworkRecord } from './types';

export type MobileArtworkLibraryService = {
  fetchPage: (userId: string, offset?: number, limit?: number) => Promise<MobileArtworkPage>;
  fetchArtwork: (artworkId: string) => Promise<MobileArtworkRecord>;
};

export type MobileArtworkLibraryServiceOptions = {
  apiBaseUrl: string;
  apiClient: ApiClient;
};

export function mapMobileArtwork(
  record: ArtworkRecord,
  apiBaseUrl: string,
): MobileArtworkRecord {
  return {
    id: record.id,
    photoUri: record.photo_uri,
    resolvedImageUri: resolveRemoteImageUrl(record.photo_uri, apiBaseUrl),
    cacheKey: `artwork:${record.id}`,
    artistName: record.artist_name || 'Unknown Artist',
    artworkName: record.artwork_name || 'Untitled',
    analysis: record.analysis,
    analysisStatus: record.analysis_status,
    analysisError: record.analysis_error,
    date: record.date,
    medium: record.medium,
    movement: record.movement,
    periodBucket: record.period_bucket,
    tags: record.artwork_tags.map((tag) => tag.name),
    createdAt: record.created_at,
  };
}

export function toPendingArtworkUpload(
  artwork: MobileArtworkRecord,
): PendingArtworkUpload {
  return {
    id: artwork.id,
    photoUri: artwork.photoUri,
    resolvedImageUri: artwork.resolvedImageUri,
    cacheKey: artwork.cacheKey,
    analysisStatus: 'pending',
    artistName: artwork.artistName,
    artworkName: artwork.artworkName,
  };
}

export function createMobileArtworkLibraryService({
  apiBaseUrl,
  apiClient,
}: MobileArtworkLibraryServiceOptions): MobileArtworkLibraryService {
  return {
    async fetchPage(userId, offset = 0, limit = 30) {
      const page = await fetchArtworkPage(apiClient, apiBaseUrl, { userId, offset, limit });
      return {
        ...page,
        items: page.items.map((record) => mapMobileArtwork(record, apiBaseUrl)),
      };
    },
    async fetchArtwork(artworkId) {
      const record = await fetchArtworkById(apiClient, apiBaseUrl, artworkId);
      return mapMobileArtwork(record, apiBaseUrl);
    },
  };
}
