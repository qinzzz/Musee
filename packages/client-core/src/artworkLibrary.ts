import { ApiHttpError } from './health';
import type { ApiClient } from './apiClient';
import type { MuseumSummary } from './museums';
import type { ArtworkAnalysisStatus } from './artworkAnalysis';

export type ArtworkTagRecord = {
  id: string;
  name: string;
};

export type ArtworkRecord = {
  capture_location_override?: import('./captureLocation').CaptureLocationOverride | null;
  location?: { latitude?: number; longitude?: number } | null;
  capture_museum?: MuseumSummary | null;
  museum_name?: string | null;
  photo_time?: string | null;
  artist_entity_id?: string | null;
  id: string;
  photo_uri: string;
  thumbnail_uri?: string | null;
  artist_name: string;
  artwork_name: string;
  analysis: string | null;
  analysis_status: ArtworkAnalysisStatus;
  analysis_error: string | null;
  date: string | null;
  medium: string | null;
  movement: string | null;
  period_bucket: string | null;
  artwork_tags: ArtworkTagRecord[];
  deleted_at?: string | null;
  is_deleted?: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type ArtworkPage = {
  items: ArtworkRecord[];
  total: number;
  offset: number;
  limit: number;
};

export type ArtworkPageRequest = {
  userId: string;
  limit?: number;
  offset?: number;
};

const DEFAULT_PAGE_SIZE = 30;
const ARTWORK_LOAD_FAILED = 'Musee could not load your artwork library.';

export async function fetchArtworkPage(
  client: ApiClient,
  apiBaseUrl: string,
  { userId, limit = DEFAULT_PAGE_SIZE, offset = 0 }: ArtworkPageRequest,
): Promise<ArtworkPage> {
  const params = new URLSearchParams({
    user_id: userId,
    limit: String(limit),
    offset: String(offset),
  });
  const response = await client.fetchWithTimeout(
    `${apiBaseUrl}/artworks?${params.toString()}`,
  );
  if (!response.ok) throw new ApiHttpError(ARTWORK_LOAD_FAILED, response.status);
  return response.json() as Promise<ArtworkPage>;
}

export async function fetchArtworkById(
  client: ApiClient,
  apiBaseUrl: string,
  artworkId: string,
): Promise<ArtworkRecord> {
  const response = await client.fetchWithTimeout(
    `${apiBaseUrl}/artworks/${encodeURIComponent(artworkId)}`,
  );
  if (!response.ok) throw new ApiHttpError(ARTWORK_LOAD_FAILED, response.status);
  return response.json() as Promise<ArtworkRecord>;
}
