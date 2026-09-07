import { describe, expect, it, vi } from 'vitest';
import { createMuseumService, filterMuseumsBySearch } from './museums';

describe('museum reads', () => {
  it('encodes identities and preserves page metadata', async () => {
    const page = { items: [], total: 40, offset: 30, limit: 30 };
    const fetchWithTimeout = vi.fn(async () => new Response(JSON.stringify(page)));
    expect(await createMuseumService({ fetchWithTimeout }, '/api').artworkPage('m/1', 'u&1', 30)).toEqual(page);
    expect(fetchWithTimeout).toHaveBeenCalledWith('/api/museums/m%2F1/artworks?user_id=u%261&offset=30&limit=30', { timeout: 15000 });
  });
  it('distinguishes empty collections from authorization and network failures', async () => {
    const fetchWithTimeout = vi.fn(async () => new Response('{"items":[],"count":0}'));
    const service = createMuseumService({ fetchWithTimeout }, '/api');
    expect(await service.list('u')).toEqual({ items: [], count: 0 });
    fetchWithTimeout.mockResolvedValueOnce(new Response('', { status: 403 }));
    await expect(service.list('u')).rejects.toMatchObject({ status: 403 });
    fetchWithTimeout.mockRejectedValueOnce(new Error('offline'));
    await expect(service.artworkPage('m', 'u')).rejects.toThrow('offline');
  });
  it('searches canonical venue names without case or surrounding whitespace sensitivity', () => {
    const item = { museum: { id: 'm', canonical_name: 'Getty Center' }, artwork_count: 1, artwork_ids: ['a'], cover_artwork_ids: ['a'], first_recorded_on: null, last_recorded_on: null };
    expect(filterMuseumsBySearch([item], ' GETTY ')).toEqual([item]);
    expect(filterMuseumsBySearch([item], 'met')).toEqual([]);
  });
});
