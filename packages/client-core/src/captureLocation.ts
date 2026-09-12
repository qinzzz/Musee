import type { ApiClient } from './apiClient';
import type { ArtworkRecord } from './artworkLibrary';
import { ApiHttpError } from './health';

export type CaptureLocationOverride =
  | { status: 'removed' }
  | { status: 'selected'; source: 'manual'; name: string }
  | { status: 'selected'; source: 'apple_maps'; place_id: string }
  | { status: 'selected'; source: 'museum'; museum_id: string };

export type CaptureLocationUpdate = CaptureLocationOverride & {
  match_hint?: { name: string; latitude: number; longitude: number };
};

export const APPLE_PLACE_SAVED = 'Place saved in Apple Maps';

export function captureLocationLabel(
  override: CaptureLocationOverride | null | undefined,
  museumName?: string | null,
): string | null {
  if (!override) return museumName?.trim() || null;
  if (override.status === 'removed') return null;
  if (override.source === 'manual') return override.name;
  if (override.source === 'apple_maps') return museumName?.trim() || APPLE_PLACE_SAVED;
  return museumName?.trim() || 'Selected museum unavailable';
}

export async function updateCaptureLocation(client: ApiClient, apiBaseUrl: string,
  artworkId: string, update: CaptureLocationUpdate): Promise<ArtworkRecord> {
  const response = await client.fetchWithTimeout(
    `${apiBaseUrl}/artworks/${encodeURIComponent(artworkId)}/capture-location`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update),
    },
  );
  if (!response.ok) throw new ApiHttpError('Musee could not save the location.', response.status);
  return response.json() as Promise<ArtworkRecord>;
}
