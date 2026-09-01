import { describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '@musee/client-core';

import {
  createMobileArtworkUploadTransport,
  MobileArtworkUploadHttpError,
} from './mobileArtworkUploadTransport';
import type { NativeImageAsset } from './types';

const API_BASE_URL = 'https://api.example.com/api';
const ASSET: NativeImageAsset = {
  uri: 'file:///cache/artwork.jpg',
  fileName: 'artwork.jpg',
  mimeType: 'image/jpeg',
  fileSize: 100,
  width: 1200,
  height: 900,
  source: 'library',
};
const SAVED_ARTWORK = {
  id: 'artwork-1',
  photo_uri: 'https://images.example.com/artwork.jpg',
  artist_name: 'Unknown Artist',
  artwork_name: 'Untitled',
  analysis_status: 'pending' as const,
};

function createApiClient(response: Response): ApiClient {
  return {
    fetchWithTimeout: vi.fn().mockResolvedValue(response),
    getAccessToken: vi.fn(),
    setAccessToken: vi.fn(),
    refreshAccessToken: vi.fn(),
  };
}

describe('mobile artwork upload transport', () => {
  it('uploads the native file with the authenticated artwork fields', async () => {
    const apiClient = createApiClient(Response.json(SAVED_ARTWORK));
    const file = new Blob(['image'], { type: 'image/jpeg' });
    const transport = createMobileArtworkUploadTransport({
      apiBaseUrl: API_BASE_URL,
      apiClient,
      createUploadFile: vi.fn().mockReturnValue(file),
    });

    await expect(
      transport.uploadArtwork(ASSET, 'user-1', 'request-1'),
    ).resolves.toEqual(SAVED_ARTWORK);

    const [resource, options] = vi.mocked(apiClient.fetchWithTimeout).mock.calls[0] ?? [];
    const body = options?.body as FormData;
    expect(resource).toBe(`${API_BASE_URL}/artworks/upload`);
    expect(options?.method).toBe('POST');
    expect(options?.credentials).toBe('omit');
    const uploadedFile = body.get('image') as File;
    expect(uploadedFile).toBeInstanceOf(Blob);
    expect(uploadedFile.name).toBe('artwork.jpg');
    expect(uploadedFile.type).toBe('image/jpeg');
    expect(uploadedFile.size).toBe(file.size);
    expect(body.get('user_id')).toBe('user-1');
    expect(body.get('client_type')).toBe('ios');
    expect(body.get('source')).toBe('upload');
    expect(body.get('request_id')).toBe('request-1');
  });

  it('preserves a backend upload error', async () => {
    const apiClient = createApiClient(Response.json(
      { detail: 'File too large' },
      { status: 400 },
    ));
    const transport = createMobileArtworkUploadTransport({
      apiBaseUrl: API_BASE_URL,
      apiClient,
      createUploadFile: () => new Blob(),
    });

    await expect(
      transport.uploadArtwork(ASSET, 'user-1', 'request-1'),
    ).rejects.toEqual(new MobileArtworkUploadHttpError(400, 'File too large'));
  });
});
