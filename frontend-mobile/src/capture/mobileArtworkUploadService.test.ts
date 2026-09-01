import { describe, expect, it, vi } from 'vitest';

import type { ImageCache } from '../platform/images/imageCache';
import type { MobileArtworkUploadTransport } from './mobileArtworkUploadTransport';
import { createMobileArtworkUploadService } from './mobileArtworkUploadService';
import type { NativeImageAsset } from './types';

const ASSET: NativeImageAsset = {
  uri: 'file:///cache/artwork.jpg',
  fileName: 'artwork.jpg',
  mimeType: 'image/jpeg',
  width: 100,
  height: 100,
  source: 'library',
};

function createDependencies() {
  const imageCache: ImageCache = { write: vi.fn().mockResolvedValue(undefined) };
  const transport: MobileArtworkUploadTransport = {
    uploadArtwork: vi.fn().mockResolvedValue({
      id: 'artwork-1',
      photo_uri: 'uploads/user/artwork.jpg',
      artist_name: 'Unknown Artist',
      artwork_name: 'Untitled',
      analysis_status: 'pending',
    }),
  };
  return { imageCache, transport };
}

describe('mobile artwork upload service', () => {
  it('seeds the image cache and returns a cloud-referenced artwork', async () => {
    const dependencies = createDependencies();
    const service = createMobileArtworkUploadService({
      apiBaseUrl: 'http://127.0.0.1:8000/api',
      ...dependencies,
      createRequestId: () => 'request-1',
    });

    await expect(service.uploadArtwork(ASSET, 'user-1')).resolves.toEqual({
      id: 'artwork-1',
      photoUri: 'uploads/user/artwork.jpg',
      resolvedImageUri: 'http://127.0.0.1:8000/uploads/user/artwork.jpg',
      cacheKey: 'artwork:artwork-1',
      analysisStatus: 'pending',
      artistName: 'Unknown Artist',
      artworkName: 'Untitled',
    });
    expect(dependencies.transport.uploadArtwork).toHaveBeenCalledWith(
      ASSET,
      'user-1',
      'request-1',
    );
    expect(dependencies.imageCache.write).toHaveBeenCalledWith(
      ASSET.uri,
      'artwork:artwork-1',
    );
  });

  it('does not fail a completed upload when cache prefill fails', async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.imageCache.write).mockRejectedValue(new Error('cache unavailable'));
    const service = createMobileArtworkUploadService({
      apiBaseUrl: 'https://api.example.com/api',
      ...dependencies,
    });

    await expect(service.uploadArtwork(ASSET, 'user-1')).resolves.toMatchObject({
      id: 'artwork-1',
    });
  });
});
