import type { ApiClient } from './apiClient';
import { ApiHttpError } from './health';
import type { ArtworkPage } from './artworkLibrary';

export type Board = {
  id: string;
  name: string;
  description?: string | null;
  itemIds: string[];
};
type CollectionResponse = Omit<Board, 'itemIds'> & {
  artwork_ids?: string[];
  artworks?: Array<{ id: string }>;
};
export type BoardUpdates = {
  name?: string;
  description?: string;
  artworkIds?: string[];
  addArtworkIds?: string[];
  removeArtworkIds?: string[];
};

export function createBoardService(client: Pick<ApiClient, 'fetchWithTimeout'>, apiBaseUrl: string) {
  const root = `${apiBaseUrl}/collections`;
  const owner = (userId: string) => `user_id=${encodeURIComponent(userId)}`;
  const path = (id: string) => `${root}/${encodeURIComponent(id)}`;
  const map = (record: CollectionResponse): Board => ({
    id: record.id, name: record.name, description: record.description ?? null,
    itemIds: record.artwork_ids ?? (record.artworks ?? []).map(({ id }) => id),
  });
  async function request(url: string, method = 'GET', body?: unknown) {
    const response = await client.fetchWithTimeout(url, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    });
    if (!response.ok) throw new ApiHttpError('Musee could not complete the board request.', response.status);
    return response;
  }
  return {
    async list(userId: string): Promise<Board[]> {
      return ((await (await request(`${root}?${owner(userId)}`)).json()) as CollectionResponse[]).map(map);
    },
    async get(id: string): Promise<Board> {
      return map(await (await request(path(id))).json());
    },
    async create(userId: string, name: string, artworkIds: string[] = [], description?: string): Promise<Board> {
      return map(await (await request(root, 'POST', {
        user_id: userId, name: name.trim(), description, artwork_ids: [...new Set(artworkIds)],
      })).json());
    },
    async update(userId: string, id: string, updates: BoardUpdates): Promise<Board> {
      return map(await (await request(`${path(id)}?${owner(userId)}`, 'PUT', {
        name: updates.name?.trim(), description: updates.description,
        artwork_ids: updates.artworkIds,
        add_artwork_ids: updates.addArtworkIds,
        remove_artwork_ids: updates.removeArtworkIds,
      })).json());
    },
    async remove(userId: string, id: string): Promise<void> {
      await request(`${path(id)}?${owner(userId)}`, 'DELETE');
    },
    async artworks(id: string, offset = 0, limit = 30): Promise<ArtworkPage> {
      return (await request(`${path(id)}/artworks?offset=${offset}&limit=${limit}`)).json();
    },
  };
}
