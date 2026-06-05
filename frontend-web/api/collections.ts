import type { Album } from '../types';
import { API_BASE_URL, fetchWithTimeout } from './core';

interface CollectionResponse {
  id: string;
  name: string;
  description?: string | null;
  artworks?: Array<{ id: string }>;
}

function mapCollectionToAlbum(collection: CollectionResponse): Album {
  return {
    id: collection.id,
    name: collection.name,
    description: collection.description ?? null,
    itemIds: (collection.artworks || []).map((artwork) => artwork.id),
  };
}

export async function fetchCollections(userId: string): Promise<Album[]> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/collections?user_id=${encodeURIComponent(userId)}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`collections error (${response.status}): ${errorText}`);
  }
  const data: CollectionResponse[] = await response.json();
  return data.map(mapCollectionToAlbum);
}

export async function createCollection(
  userId: string,
  name: string,
  artworkIds: string[] = [],
  description?: string,
): Promise<Album> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: userId,
      name,
      description,
      artwork_ids: artworkIds,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`create collection error (${response.status}): ${errorText}`);
  }
  const data: CollectionResponse = await response.json();
  return mapCollectionToAlbum(data);
}

export async function updateCollection(
  collectionId: string,
  updates: { name?: string; description?: string; artworkIds?: string[] },
): Promise<Album> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/collections/${collectionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: updates.name,
      description: updates.description,
      artwork_ids: updates.artworkIds,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`update collection error (${response.status}): ${errorText}`);
  }
  const data: CollectionResponse = await response.json();
  return mapCollectionToAlbum(data);
}

export async function deleteCollection(collectionId: string): Promise<void> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/collections/${collectionId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`delete collection error (${response.status}): ${errorText}`);
  }
}
