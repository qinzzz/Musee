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
  artist_entity_id: 'artist-1',
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
      artistEntityId: 'artist-1',
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

describe('artwork metadata persistence', () => {
  it('sends only edited fields, including explicit clears, and uses the canonical saved record', async () => {
    const client = createClient();
    vi.mocked(client.fetchWithTimeout).mockReset().mockResolvedValue(Response.json({
      ...RECORD, artwork_name: 'Corrected title', date: '', artwork_tags: [],
    }));
    const service = createMobileArtworkLibraryService({ apiBaseUrl: 'https://api.example.com/api', apiClient: client });
    const saved = await service.updateArtwork('artwork/1', { artworkName: '  Corrected title  ', date: '', tags: '' });
    expect(client.fetchWithTimeout).toHaveBeenCalledWith('https://api.example.com/api/artworks/artwork%2F1', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artwork_name: 'Corrected title', date: '', tags: '' }),
    });
    expect(saved).toMatchObject({ artworkName: 'Corrected title', date: '', tags: [] });
    expect(saved.artistName).toBe(RECORD.artist_name);
  });

  it.each([401, 404, 500])('reports a failed save (%s) without returning a success record', async (status) => {
    const client = createClient();
    vi.mocked(client.fetchWithTimeout).mockReset().mockResolvedValue(new Response(null, { status }));
    const service = createMobileArtworkLibraryService({ apiBaseUrl: 'https://api.example.com/api', apiClient: client });
    await expect(service.updateArtwork(RECORD.id, { medium: 'Ink' })).rejects.toMatchObject({ status });
  });

  it('propagates interrupted writes so the editor can retain its draft', async () => {
    const client = createClient();
    vi.mocked(client.fetchWithTimeout).mockReset().mockRejectedValue(new TypeError('Network unavailable'));
    const service = createMobileArtworkLibraryService({ apiBaseUrl: 'https://api.example.com/api', apiClient: client });
    await expect(service.updateArtwork(RECORD.id, { artistName: 'Updated artist' })).rejects.toThrow('Network unavailable');
  });
});

describe('Identify Again and Delete', () => {
  function setup(response: Response) {
    const client = createClient();
    vi.mocked(client.fetchWithTimeout).mockReset().mockResolvedValue(response);
    return { client, service: createMobileArtworkLibraryService({ apiBaseUrl: 'https://api.example.com/api', apiClient: client }) };
  }

  it('uses the web identification endpoint with trimmed clues and the existing artwork ID', async () => {
    const { client, service } = setup(Response.json({ artwork_id: RECORD.id }));
    await service.identifyAgain(RECORD.id, { artistName: '  Hilma  ', artworkName: ' ', additionalClue: '  Museum label  ' });
    const [url, options] = vi.mocked(client.fetchWithTimeout).mock.calls[0];
    expect(url).toBe('https://api.example.com/api/artworks/analyze');
    expect(options).toMatchObject({ method: 'POST', timeout: 120000 });
    const form = options?.body as FormData;
    expect([...form.entries()]).toEqual([
      ['artwork_id', RECORD.id], ['artist_name', 'Hilma'], ['additional_clue', 'Museum label'],
    ]);
  });

  it('rejects empty clues before starting a request', async () => {
    const { client, service } = setup(Response.json({}));
    await expect(service.identifyAgain(RECORD.id, { artistName: ' ', artworkName: '', additionalClue: '\n' }))
      .rejects.toThrow('Enter at least one clue');
    expect(client.fetchWithTimeout).not.toHaveBeenCalled();
  });

  it('deletes only the selected artwork through the existing collection endpoint', async () => {
    const { client, service } = setup(Response.json({ message: 'Artwork removed from collection' }));
    await service.deleteArtwork('artwork/1', 'user+1');
    expect(client.fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.example.com/api/artworks/artwork%2F1?user_id=user%2B1', { method: 'DELETE' },
    );
  });

  it.each([401, 403, 404, 500])('propagates unsuccessful mutations (%s)', async (status) => {
    const { service } = setup(new Response(null, { status }));
    await expect(service.identifyAgain(RECORD.id, { artistName: 'Artist', artworkName: '', additionalClue: '' }))
      .rejects.toMatchObject({ status });
    await expect(service.deleteArtwork(RECORD.id, 'user-1')).rejects.toMatchObject({ status });
  });
});
