import type { ApiClient } from './apiClient';
import type { ArtworkPage, ArtworkRecord } from './artworkLibrary';
import { ApiHttpError } from './health';

export type ArtistEntity = {
  id: string;
  display_name: string;
  bio?: string | null;
  nationality?: string | null;
  birth_year?: number | null;
  death_year?: number | null;
  movements?: string[];
  profile_image_url?: string | null;
  instance_count: number;
  bio_status: string;
};
export type ArtistRow = ArtistEntity & { artwork_count: number };

export function filterArtistsBySearch(artists: ArtistRow[], query: string): ArtistRow[] {
  const normalized = query.trim().toLowerCase();
  return normalized ? artists.filter((artist) =>
    [artist.display_name, artist.nationality].some((value) => value?.toLowerCase().includes(normalized))) : artists;
}
export function artistLifespan(artist: ArtistEntity): string | null {
  if (artist.birth_year && artist.death_year) return `${artist.birth_year}–${artist.death_year}`;
  return artist.birth_year ? `b. ${artist.birth_year}` : null;
}
export function createArtistService(client: Pick<ApiClient, 'fetchWithTimeout'>, baseUrl: string) {
  const path = (id: string) => `${baseUrl}/artists/${encodeURIComponent(id)}`;
  async function read<T>(url: string): Promise<T> {
    const response = await client.fetchWithTimeout(url);
    if (!response.ok) throw new ApiHttpError('Musee could not load artist information.', response.status);
    return response.json();
  }
  return {
    list: (userId: string) => read<ArtistRow[]>(`${baseUrl}/artists?user_id=${encodeURIComponent(userId)}`),
    profile: (id: string) => read<ArtistEntity>(path(id)),
    artworks: (id: string, userId: string) => read<ArtworkRecord[]>(`${path(id)}/artworks?user_id=${encodeURIComponent(userId)}`),
    artworkPage: (id: string, userId: string, offset = 0, limit = 30) =>
      read<ArtworkPage>(`${path(id)}/artworks?user_id=${encodeURIComponent(userId)}&offset=${offset}&limit=${limit}`),
  };
}
