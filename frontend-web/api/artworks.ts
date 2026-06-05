import type { ArtworkSkill, ArtworkClassification, ReferenceItem, TasteProfileSnapshot } from '../types';
import { API_BASE_URL, fetchWithTimeout, resolveImageUrl } from './core';

export interface ArtworkAnalysisResult {
  artist_name: string;
  artwork_name: string;
  description: string;
  tags: string[];
  date?: string;
  medium?: string;
  model_used: string;
  artwork_id?: string;
  photo_uri?: string;
  location?: string;
  photo_time?: string;
  session_title?: string;
  reference_urls?: ReferenceItem[];
  artist_entity_id?: string;
}

export interface SmartCollection {
  id: string;
  type: 'movement';
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  description: string;
  artwork_count: number;
  artwork_ids: string[];
  cover_uris: string[];
  hook: string;
}

export interface PublicComment {
  id: string;
  entity_id: string;
  user_id: string;
  author_name: string;
  author_avatar?: string;
  text: string;
  created_at: string;
}

export interface CommunityData {
  entity: { id: string; display_artist: string; display_title: string; instance_count: number } | null;
  comments: PublicComment[];
}

export async function fetchUserArtworks(userId: string): Promise<any> {
  const params = new URLSearchParams({
    user_id: userId,
    limit: '100',
  });

  const response = await fetchWithTimeout(`${API_BASE_URL}/artworks?${params.toString()}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }
  return response.json();
}

export async function fetchInsights(
  artistName: string,
  artworkName: string,
  language?: string,
): Promise<Array<{ title: string; text: string }>> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/artwork-insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artist_name: artistName, artwork_name: artworkName, language: language || null }),
    timeout: 30000,
  });
  if (!response.ok) return [];
  const data = await response.json();
  return data.points ?? [];
}

export async function fetchAndPersistInsights(
  artworkId: string,
  language?: string,
): Promise<Array<{ title: string; text: string }>> {
  const url = new URL(`${API_BASE_URL}/artworks/${artworkId}/insights`);
  if (language) url.searchParams.set('language', language);
  const response = await fetchWithTimeout(url.toString(), { method: 'POST', timeout: 30000 });
  if (!response.ok) return [];
  const data = await response.json();
  return data.insights ?? [];
}

export async function fetchArtistProfile(artistEntityId: string): Promise<import('../types').ArtistEntity | null> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/artists/${artistEntityId}`, { timeout: 15000 });
  if (!response.ok) return null;
  return response.json();
}

export async function fetchUserArtists(userId: string): Promise<any[]> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/artists?user_id=${encodeURIComponent(userId)}`,
    { timeout: 15000 },
  );
  if (!response.ok) return [];
  return response.json();
}

export async function fetchArtistArtworks(artistEntityId: string, userId: string): Promise<any[]> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/artists/${artistEntityId}/artworks?user_id=${encodeURIComponent(userId)}`,
    { timeout: 15000 },
  );
  if (!response.ok) return [];
  return response.json();
}

export async function backfillArtworkArtist(artworkId: string): Promise<import('../types').ArtistEntity | null> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/artworks/${artworkId}/artist`, {
    method: 'POST',
    timeout: 20000,
  });
  if (!response.ok) return null;
  return response.json();
}

export async function reanalyzeArtwork(artworkId: string): Promise<any> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/artworks/analyze`, {
    method: 'POST',
    body: (() => {
      const formData = new FormData();
      formData.append('artwork_id', artworkId);
      return formData;
    })(),
    timeout: 120000,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }
  return response.json();
}

export async function updateArtwork(
  artworkId: string,
  updates: { artistName?: string; artworkName?: string; date?: string; medium?: string; tags?: string },
): Promise<any> {
  const body: Record<string, string> = {};
  if (updates.artistName !== undefined) body.artist_name = updates.artistName;
  if (updates.artworkName !== undefined) body.artwork_name = updates.artworkName;
  if (updates.date !== undefined) body.date = updates.date;
  if (updates.medium !== undefined) body.medium = updates.medium;
  if (updates.tags !== undefined) body.tags = updates.tags;

  const response = await fetchWithTimeout(`${API_BASE_URL}/artworks/${artworkId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }
  return response.json();
}

export async function updateArtworkClassification(
  artworkId: string,
  classification: ArtworkClassification,
): Promise<{ artwork_id: string; classification: ArtworkClassification; profile_invalidated: boolean }> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/artworks/${artworkId}/classification`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classification }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }
  return response.json();
}

export async function deleteArtwork(artworkId: string, userId: string): Promise<any> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/artworks/${artworkId}?user_id=${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }
  return response.json();
}

export async function fetchSmartCollections(userId: string): Promise<SmartCollection[]> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/smart-collections?user_id=${encodeURIComponent(userId)}`);
  if (!response.ok) {
    throw new Error(`smart-collections error (${response.status})`);
  }
  const data = await response.json();
  return data.collections as SmartCollection[];
}

export async function fetchCommunity(artworkId: string): Promise<CommunityData> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/artworks/${artworkId}/community`);
  if (!response.ok) throw new Error(`API error (${response.status})`);
  return response.json();
}

export async function publishComment(artworkId: string, userId: string, text: string): Promise<PublicComment> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/artworks/${artworkId}/community/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, text }),
  });
  if (!response.ok) throw new Error(`API error (${response.status})`);
  return response.json();
}

export async function deleteCommunityComment(artworkId: string, commentId: string, userId: string): Promise<void> {
  const response = await fetchWithTimeout(
    `${API_BASE_URL}/artworks/${artworkId}/community/comments/${commentId}?user_id=${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
  if (!response.ok) throw new Error(`API error (${response.status})`);
}

export async function getTasteProfile(userId: string): Promise<TasteProfileSnapshot> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/taste-profile?user_id=${encodeURIComponent(userId)}`, {});
  if (!response.ok) throw new Error('Failed to load taste profile');
  return response.json();
}

export async function generateTasteProfile(userId: string): Promise<TasteProfileSnapshot> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/taste-profile/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
    timeout: 120000,
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to generate taste profile');
  }
  return response.json();
}

export { resolveImageUrl };
