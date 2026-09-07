import { describe, expect, it, vi } from 'vitest';
import { createArtistService } from './artists';

describe('artist reads', () => {
  it('keeps account and artist identifiers encoded and preserves pagination metadata', async () => {
    const page = { items: [], total: 43, offset: 30, limit: 30 };
    const fetchWithTimeout = vi.fn(async () => new Response(JSON.stringify(page)));
    const service = createArtistService({ fetchWithTimeout }, '/api');
    expect(await service.artworkPage('a/1', 'u&1', 30)).toEqual(page);
    expect(fetchWithTimeout).toHaveBeenCalledWith('/api/artists/a%2F1/artworks?user_id=u%261&offset=30&limit=30');
  });
  it('distinguishes empty collections from failed or missing reads', async () => {
    const fetchWithTimeout = vi.fn(async () => new Response('[]'));
    const service = createArtistService({ fetchWithTimeout }, '/api');
    expect(await service.list('u')).toEqual([]);
    fetchWithTimeout.mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(service.list('u')).rejects.toMatchObject({ status: 403 });
    fetchWithTimeout.mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(service.profile('missing')).rejects.toMatchObject({ status: 404 });
  });
});
