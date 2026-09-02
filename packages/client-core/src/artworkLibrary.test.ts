import { describe, expect, it, vi } from 'vitest';

import type { ApiClient } from './apiClient';
import { fetchArtworkById, fetchArtworkPage } from './artworkLibrary';

function createClient(response: Response): ApiClient {
  return {
    fetchWithTimeout: vi.fn().mockResolvedValue(response),
    getAccessToken: vi.fn(),
    setAccessToken: vi.fn(),
    refreshAccessToken: vi.fn(),
  };
}

describe('artwork library API', () => {
  it('loads a bounded page for the authenticated user', async () => {
    const page = { items: [], total: 0, offset: 30, limit: 15 };
    const client = createClient(Response.json(page));

    await expect(fetchArtworkPage(client, 'https://api.example.com/api', {
      userId: 'user with space',
      limit: 15,
      offset: 30,
    })).resolves.toEqual(page);
    expect(client.fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.example.com/api/artworks?user_id=user+with+space&limit=15&offset=30',
    );
  });

  it('loads an individual artwork with an encoded id', async () => {
    const record = { id: 'art/1' };
    const client = createClient(Response.json(record));

    await expect(fetchArtworkById(
      client,
      'https://api.example.com/api',
      'art/1',
    )).resolves.toEqual(record);
    expect(client.fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.example.com/api/artworks/art%2F1',
    );
  });
});
