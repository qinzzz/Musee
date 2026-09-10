import {
  ApiHttpError,
  fetchArtworkById,
  fetchArtworkPage,
  type ApiClient,
  type ArtworkRecord,
} from '@musee/client-core';

import type { PendingArtworkUpload } from '../capture/types';
import { resolveRemoteImageUrl } from '../platform/images/resolveRemoteImageUrl';
import type { MobileArtworkPage, MobileArtworkRecord } from './types';

export type IdentifyAgainHints = { artistName: string; artworkName: string; additionalClue: string };
export const IDENTIFY_CLUE_REQUIRED = 'Enter at least one clue to continue.';

export function buildIdentifyAgainForm(artworkId: string, hints: IdentifyAgainHints): FormData {
  const fields = { artist_name: hints.artistName.trim(), artwork_name: hints.artworkName.trim(), additional_clue: hints.additionalClue.trim() };
  if (!Object.values(fields).some(Boolean)) throw new Error(IDENTIFY_CLUE_REQUIRED);
  const form = new FormData();
  form.append('artwork_id', artworkId);
  for (const [key, value] of Object.entries(fields)) if (value) form.append(key, value);
  return form;
}

export type ArtworkMetadataUpdates = {
  artworkName?: string;
  artistName?: string;
  date?: string;
  medium?: string;
  tags?: string;
};

export type MobileArtworkLibraryService = {
  identifyAgain: (artworkId: string, hints: IdentifyAgainHints) => Promise<void>;
  deleteArtwork: (artworkId: string, userId: string) => Promise<void>;
  updateArtwork: (artworkId: string, updates: ArtworkMetadataUpdates) => Promise<MobileArtworkRecord>;
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
  const thumbnailUri = record.thumbnail_uri || null;
  return {
    id: record.id,
    artistEntityId: record.artist_entity_id ?? null,
    museumName: record.capture_museum?.canonical_name?.trim() || record.museum_name?.trim() || null,
    capturedAt: record.photo_time?.trim() || null,
    photoUri: record.photo_uri,
    thumbnailUri,
    resolvedImageUri: resolveRemoteImageUrl(record.photo_uri, apiBaseUrl),
    resolvedThumbnailUri: resolveRemoteImageUrl(
      thumbnailUri || record.photo_uri,
      apiBaseUrl,
    ),
    cacheKey: `artwork:${record.id}`,
    thumbnailCacheKey: thumbnailUri
      ? `artwork-thumbnail:${record.id}`
      : `artwork:${record.id}`,
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
    isDeleted: Boolean(record.is_deleted || record.deleted_at),
    createdAt: record.created_at,
  };
}

export function toPendingArtworkUpload(
  artwork: MobileArtworkRecord,
): PendingArtworkUpload {
  return {
    id: artwork.id,
    photoUri: artwork.photoUri,
    thumbnailUri: artwork.thumbnailUri,
    resolvedImageUri: artwork.resolvedImageUri,
    resolvedThumbnailUri: artwork.resolvedThumbnailUri,
    cacheKey: artwork.cacheKey,
    thumbnailCacheKey: artwork.thumbnailCacheKey,
    analysisStatus: 'pending',
    artistName: artwork.artistName,
    artworkName: artwork.artworkName,
  };
}

export function mapPendingMobileArtwork(
  artwork: PendingArtworkUpload,
): MobileArtworkRecord {
  return {
    id: artwork.id,
    photoUri: artwork.photoUri,
    thumbnailUri: artwork.thumbnailUri,
    resolvedImageUri: artwork.resolvedImageUri,
    resolvedThumbnailUri: artwork.resolvedThumbnailUri,
    cacheKey: artwork.cacheKey,
    thumbnailCacheKey: artwork.thumbnailCacheKey,
    artistName: artwork.artistName,
    artworkName: artwork.artworkName,
    analysis: null,
    analysisStatus: artwork.analysisStatus,
    analysisError: null,
    date: null,
    medium: null,
    movement: null,
    periodBucket: null,
    tags: [],
    isDeleted: false,
    createdAt: null,
  };
}

export function createMobileArtworkLibraryService({
  apiBaseUrl,
  apiClient,
}: MobileArtworkLibraryServiceOptions): MobileArtworkLibraryService {
  return {
    async identifyAgain(artworkId, hints) {
      const response = await apiClient.fetchWithTimeout(`${apiBaseUrl}/artworks/analyze`, {
        method: 'POST', body: buildIdentifyAgainForm(artworkId, hints), timeout: 120000,
      });
      if (!response.ok) throw new ApiHttpError('Could not identify the artwork again.', response.status);
    },
    async deleteArtwork(artworkId, userId) {
      const params = new URLSearchParams({ user_id: userId });
      const response = await apiClient.fetchWithTimeout(
        `${apiBaseUrl}/artworks/${encodeURIComponent(artworkId)}?${params}`, { method: 'DELETE' },
      );
      if (!response.ok) throw new ApiHttpError('Could not remove artwork.', response.status);
    },
    async updateArtwork(artworkId, updates) {
      const response = await apiClient.fetchWithTimeout(
        `${apiBaseUrl}/artworks/${encodeURIComponent(artworkId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            artwork_name: updates.artworkName?.trim(),
            artist_name: updates.artistName?.trim(),
            date: updates.date?.trim(),
            medium: updates.medium?.trim(),
            tags: updates.tags,
          }),
        },
      );
      if (!response.ok) throw new ApiHttpError('Musee could not save your changes.', response.status);
      return mapMobileArtwork(await response.json() as ArtworkRecord, apiBaseUrl);
    },
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
