import { describe, expect, it, vi } from 'vitest';

import type { ApiClient, ArtworkRecord } from '@musee/client-core';

import {
  createMobileArtworkLibraryService,
  mapMobileArtwork,
  toPendingArtworkUpload,
} from './mobileArtworkLibraryService';

const RECORD: ArtworkRecord = {
  id: 'artwork-1',
  photo_uri: 'uploads/user/artwork.jpg',
  thumbnail_uri: 'uploads/user/artwork_thumbnail.jpg',
  artist_name: 'Hilma af Klint',
  artwork_name: 'The Swan',
  analysis: 'A symbolic abstract composition.',
  analysis_status: 'analyzed',
  analysis_error: null,
  date: '1915',
  medium: 'Oil on canvas',
  movement: 'Abstract Art',
  period_bucket: 'Modern',
  artwork_tags: [{ id: 'tag-1', name: '#abstract' }],
  created_at: '2026-09-01T12:00:00Z',
  updated_at: '2026-09-01T12:01:00Z',
};

function createClient(): ApiClient {
  return {
    fetchWithTimeout: vi.fn()
      .mockResolvedValueOnce(Response.json({
        items: [RECORD],
        total: 1,
        offset: 0,
        limit: 30,
      }))
      .mockResolvedValueOnce(Response.json(RECORD)),
    getAccessToken: vi.fn(),
    setAccessToken: vi.fn(),
    refreshAccessToken: vi.fn(),
  };
}

describe('mobile artwork library service', () => {
  it('maps backend records to stable image cache identities', async () => {
    const client = createClient();
    const service = createMobileArtworkLibraryService({
      apiBaseUrl: 'http://127.0.0.1:8000/api',
      apiClient: client,
    });

    await expect(service.fetchPage('user-1')).resolves.toMatchObject({
      total: 1,
      items: [{
        id: 'artwork-1',
        resolvedImageUri: 'http://127.0.0.1:8000/uploads/user/artwork.jpg',
        resolvedThumbnailUri: 'http://127.0.0.1:8000/uploads/user/artwork_thumbnail.jpg',
        cacheKey: 'artwork:artwork-1',
        thumbnailCacheKey: 'artwork-thumbnail:artwork-1',
        tags: ['#abstract'],
      }],
    });
    await expect(service.fetchArtwork('artwork-1')).resolves.toMatchObject({
      artistName: 'Hilma af Klint',
      artworkName: 'The Swan',
    });
  });

  it('falls back to the primary image for legacy records', () => {
    const artwork = mapMobileArtwork(
      { ...RECORD, thumbnail_uri: null },
      'https://api.example.com/api',
    );

    expect(artwork.resolvedThumbnailUri).toBe(
      'https://api.example.com/uploads/user/artwork.jpg',
    );
    expect(artwork.thumbnailCacheKey).toBe('artwork:artwork-1');
  });

  it('converts any persisted status into an analysis retry input', () => {
    const artwork = mapMobileArtwork(RECORD, 'https://api.example.com/api');
    expect(toPendingArtworkUpload({
      ...artwork,
      analysisStatus: 'failed',
    })).toMatchObject({
      id: 'artwork-1',
      analysisStatus: 'pending',
      photoUri: 'uploads/user/artwork.jpg',
    });
  });
});
