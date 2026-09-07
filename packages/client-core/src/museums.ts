import type { ApiClient } from './apiClient';
import type { ArtworkPage } from './artworkLibrary';
import { ApiHttpError } from './health';

export interface MuseumSummary {
  id: string;
  canonical_name: string;
  thumbnail_url?: string | null;
  thumbnail_attribution?: string | null;
}

export interface UserMuseumSummary {
  museum: MuseumSummary;
  artwork_count: number;
  artwork_ids: string[];
  cover_artwork_ids: string[];
  first_recorded_on: string | null;
  last_recorded_on: string | null;
}

export interface UserMuseumsResponse {
  items: UserMuseumSummary[];
  count: number;
}

export function filterMuseumsBySearch(items: UserMuseumSummary[], query: string) {
  const normalized = query.trim().toLowerCase();
  return items.filter(({ museum }) => museum.canonical_name.toLowerCase().includes(normalized));
}
export function createMuseumService(client: Pick<ApiClient, 'fetchWithTimeout'>, baseUrl: string) {
  async function read<T>(url: string): Promise<T> {
    const response = await client.fetchWithTimeout(url, { timeout: 15000 });
    if (!response.ok) throw new ApiHttpError('Musee could not load museum information.', response.status);
    return response.json();
  }
  return {
    list: (userId: string) => read<UserMuseumsResponse>(`${baseUrl}/museums?user_id=${encodeURIComponent(userId)}`),
    artworkPage: (id: string, userId: string, offset = 0, limit = 30) =>
      read<ArtworkPage>(`${baseUrl}/museums/${encodeURIComponent(id)}/artworks?user_id=${encodeURIComponent(userId)}&offset=${offset}&limit=${limit}`),
  };
}
