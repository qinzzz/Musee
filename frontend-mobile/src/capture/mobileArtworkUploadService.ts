import type { ImageCache } from '../platform/images/imageCache';
import { resolveRemoteImageUrl } from '../platform/images/resolveRemoteImageUrl';
import type { MobileArtworkUploadTransport } from './mobileArtworkUploadTransport';
import type { NativeImageAsset, PendingArtworkUpload } from './types';

export type MobileArtworkUploadService = {
  uploadArtwork: (
    asset: NativeImageAsset,
    userId: string,
    sessionId?: string,
  ) => Promise<PendingArtworkUpload>;
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

export function createMobileArtworkUploadService({
  apiBaseUrl,
  imageCache,
  transport,
  createRequestId = defaultRequestId,
}: MobileArtworkUploadServiceOptions): MobileArtworkUploadService {
  return {
    async uploadArtwork(asset, userId, sessionId) {
      const saved = await transport.uploadArtwork(
        asset,
        userId,
        createRequestId(),
        sessionId,
      );
      const cacheKey = `artwork:${saved.id}`;
      const thumbnailUri = saved.thumbnail_uri || null;
      await imageCache.write(asset.uri, cacheKey).catch(() => undefined);

      return {
        id: saved.id,
        photoUri: saved.photo_uri,
        thumbnailUri,
        resolvedImageUri: resolveRemoteImageUrl(saved.photo_uri, apiBaseUrl),
        resolvedThumbnailUri: resolveRemoteImageUrl(
          thumbnailUri || saved.photo_uri,
          apiBaseUrl,
        ),
        cacheKey,
        thumbnailCacheKey: thumbnailUri
          ? `artwork-thumbnail:${saved.id}`
          : cacheKey,
        analysisStatus: saved.analysis_status,
        artistName: saved.artist_name,
        artworkName: saved.artwork_name,
      };
    },
  };
}
