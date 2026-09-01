import type { ApiClient } from '@musee/client-core';

import type { NativeImageAsset } from './types';

export type SavedArtworkUploadResponse = {
  id: string;
  photo_uri: string;
  artist_name: string;
  artwork_name: string;
  analysis_status: 'pending';
};

export type MobileArtworkUploadTransport = {
  uploadArtwork: (
    asset: NativeImageAsset,
    userId: string,
    requestId: string,
  ) => Promise<SavedArtworkUploadResponse>;
};

export type MobileArtworkUploadTransportOptions = {
  apiBaseUrl: string;
  apiClient: ApiClient;
  createUploadFile: (uri: string) => Blob;
};

const ARTWORK_UPLOAD_PATH = '/artworks/upload';
const CLIENT_TYPE = 'ios';
const UPLOAD_TIMEOUT_MS = 120_000;
const UPLOAD_FAILED_MESSAGE = 'Musee could not upload this artwork.';

export class MobileArtworkUploadHttpError extends Error {
  readonly status: number;
  readonly detail: string | null;

  constructor(status: number, detail: string | null) {
    super(detail || UPLOAD_FAILED_MESSAGE);
    this.name = 'MobileArtworkUploadHttpError';
    this.status = status;
    this.detail = detail;
  }
}

async function readErrorDetail(response: Response): Promise<string | null> {
  try {
    const body = await response.json() as { detail?: string | { message?: string } };
    if (typeof body.detail === 'string') return body.detail;
    return body.detail?.message ?? null;
  } catch {
    return null;
  }
}

export function createMobileArtworkUploadTransport({
  apiBaseUrl,
  apiClient,
  createUploadFile,
}: MobileArtworkUploadTransportOptions): MobileArtworkUploadTransport {
  return {
    async uploadArtwork(asset, userId, requestId) {
      const formData = new FormData();
      formData.append('image', createUploadFile(asset.uri), asset.fileName);
      formData.append('user_id', userId);
      formData.append('client_type', CLIENT_TYPE);
      formData.append('source', asset.source === 'camera' ? 'camera' : 'upload');
      formData.append('request_id', requestId);

      const response = await apiClient.fetchWithTimeout(
        `${apiBaseUrl}${ARTWORK_UPLOAD_PATH}`,
        {
          method: 'POST',
          body: formData,
          credentials: 'omit',
          timeout: UPLOAD_TIMEOUT_MS,
        },
      );
      if (!response.ok) {
        throw new MobileArtworkUploadHttpError(
          response.status,
          await readErrorDetail(response),
        );
      }
      return response.json() as Promise<SavedArtworkUploadResponse>;
    },
  };
}
