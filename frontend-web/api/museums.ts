import { API_BASE_URL, fetchWithTimeout } from './core';

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

export async function fetchUserMuseums(userId: string): Promise<UserMuseumsResponse> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/museums?user_id=${encodeURIComponent(userId)}`,
    { timeout: 15000 },
  );
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }
  return response.json();
}
