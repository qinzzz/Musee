import { ApiHttpError, createArtistService } from '@musee/client-core';
export type { ArtistRow } from '@musee/client-core';
import type { ArtworkSkill, ArtworkClassification, ReferenceItem, TasteProfileSnapshot, ArtistEntity } from '../types';
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



const ARTWORKS_PAGE_SIZE = 100;

// The app deliberately holds the complete library in memory (session
// grouping, boards, artist rollups all join against it), so this pages
// through the backend until exhausted — fetch pagination only; the UI
// still receives one complete list.
export async function fetchUserArtworks(userId: string): Promise<any> {
  const items: any[] = [];
  let offset = 0;

  for (;;) {
    const params = new URLSearchParams({
      user_id: userId,
      limit: String(ARTWORKS_PAGE_SIZE),
      offset: String(offset),
    });

    const response = await fetchWithTimeout(`${API_BASE_URL}/artworks?${params.toString()}`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error (${response.status}): ${errorText}`);
    }
    const page = await response.json();
    const pageItems: any[] = Array.isArray(page?.items) ? page.items : [];
    items.push(...pageItems);
    offset += pageItems.length;

    const total = typeof page?.total === 'number' ? page.total : undefined;
    const exhausted = pageItems.length < ARTWORKS_PAGE_SIZE
      || (total !== undefined && offset >= total);
    if (exhausted) break;
  }

  return { items };
}

export async function getArtworkFunFacts(
  artworkId: string,
  language?: string,
): Promise<Array<{ title: string; text: string }>> {
  const url = new URL(`${API_BASE_URL}/artworks/${artworkId}/fun-facts`);
  if (language) url.searchParams.set('language', language);
  const response = await fetchWithTimeout(url.toString(), { method: 'POST', timeout: 30000 });
  if (!response.ok) return [];
  const data = await response.json();
  return data.fun_facts ?? [];
}

const artistService = createArtistService({ fetchWithTimeout }, API_BASE_URL);

export async function fetchArtistProfile(artistEntityId: string): Promise<import('../types').ArtistEntity | null> {
  try {
    return await artistService.profile(artistEntityId);
  } catch (error) {
    if (error instanceof ApiHttpError && error.status === 404) return null;
    throw error;
  }
}
export const fetchUserArtists = artistService.list;
export const fetchArtistArtworks = artistService.artworks;

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

export async function batchDeleteArtworks(
  artworkIds: string[],
  userId: string,
): Promise<{ message: string; deleted_count: number }> {
  if (artworkIds.length === 0) {
    return { message: 'No artworks to delete', deleted_count: 0 };
  }

  const response = await fetchWithTimeout(
    `${API_BASE_URL}/artworks/batch-delete?user_id=${encodeURIComponent(userId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(artworkIds),
    },
  );
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

export interface ArtworkAnalysisDebugTag {
  label: string;
  source: string;
}

export interface ArtworkAnalysisDebug {
  id: string;
  artwork_id: string;
  status: string;
  analysis_version: string;
  model: string | null;
  analyzability_note: string | null;
  error: string | null;
  visual_description: string | null;
  dimensions: Record<string, { score: number; evidence: string[] }> | null;
  tags: Record<string, ArtworkAnalysisDebugTag[]> | null;
  completed_at: string | null;
}

/** Internal/debug only: the endpoint 404s in prod, in which case this resolves to null. */
export async function getArtworkAnalysisDebug(artworkId: string): Promise<ArtworkAnalysisDebug | null> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/artworks/${artworkId}/analysis`, { timeout: 15000 });
  if (!response.ok) return null;
  const data = await response.json();
  return data.analysis ?? null;
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
