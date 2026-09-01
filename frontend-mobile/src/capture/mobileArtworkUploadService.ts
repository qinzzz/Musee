import { resolveBackendOrigin } from '@musee/client-core';

import type { ImageCache } from '../platform/images/imageCache';
import type { MobileArtworkUploadTransport } from './mobileArtworkUploadTransport';
import type { NativeImageAsset, PendingArtworkUpload } from './types';

export type MobileArtworkUploadService = {
  uploadArtwork: (asset: NativeImageAsset, userId: string) => Promise<PendingArtworkUpload>;
};

export type MobileArtworkUploadServiceOptions = {
  apiBaseUrl: string;
  imageCache: ImageCache;
  transport: MobileArtworkUploadTransport;
  createRequestId?: () => string;
};

function defaultRequestId(): string {
  return `mobile-upload-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function resolveMobileImageUrl(photoUri: string, apiBaseUrl: string): string {
  if (/^https?:\/\//.test(photoUri)) return photoUri;
  const backendOrigin = resolveBackendOrigin(apiBaseUrl).replace(/\/$/, '');
  const cleanPath = photoUri.replace(/^\//, '');
  return `${backendOrigin}/${cleanPath}`;
}

export function createMobileArtworkUploadService({
  apiBaseUrl,
  imageCache,
  transport,
  createRequestId = defaultRequestId,
}: MobileArtworkUploadServiceOptions): MobileArtworkUploadService {
  return {
    async uploadArtwork(asset, userId) {
      const saved = await transport.uploadArtwork(asset, userId, createRequestId());
      const cacheKey = `artwork:${saved.id}`;
      await imageCache.write(asset.uri, cacheKey).catch(() => undefined);

      return {
        id: saved.id,
        photoUri: saved.photo_uri,
        resolvedImageUri: resolveMobileImageUrl(saved.photo_uri, apiBaseUrl),
        cacheKey,
        analysisStatus: saved.analysis_status,
        artistName: saved.artist_name,
        artworkName: saved.artwork_name,
      };
    },
  };
}
