import { API_BASE_URL, fetchWithTimeout } from './core';

export interface JournalArtworkPreview {
  id: string;
  photo_uri: string;
  artwork_name: string;
  artist_name: string;
}

export interface JournalListItem {
  id: string;
  local_date: string;
  location: string | null;
  reflection: string;
  representative_artworks: JournalArtworkPreview[];
}

export async function fetchUserJournals(userId: string): Promise<JournalListItem[]> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/journals?user_id=${encodeURIComponent(userId)}`,
    { timeout: 15000 },
  );
  if (!response.ok) {
    throw new Error('Failed to load journals');
  }
  const payload = await response.json();
  return Array.isArray(payload?.items) ? payload.items : [];
}
