import { afterEach, describe, expect, it, vi } from 'vitest';

function pageResponse(start: number, count: number, total: number) {
  return new Response(JSON.stringify({
    items: Array.from({ length: count }, (_, i) => ({ id: `art-${start + i}` })),
    count,
    total,
    offset: start,
    limit: 100,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('fetchUserArtworks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('pages through the backend until the full library is fetched', async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(pageResponse(0, 100, 250))
      .mockResolvedValueOnce(pageResponse(100, 100, 250))
      .mockResolvedValueOnce(pageResponse(200, 50, 250));
    vi.stubGlobal('fetch', fetchSpy);

    const { fetchUserArtworks } = await import('./artworks');
    const data = await fetchUserArtworks('user-1');

    expect(data.items).toHaveLength(250);
    expect(data.items[0].id).toBe('art-0');
    expect(data.items[249].id).toBe('art-249');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const requestedOffsets = fetchSpy.mock.calls.map((call) => new URL(call[0] as string, 'http://x').searchParams.get('offset'));
    expect(requestedOffsets).toEqual(['0', '100', '200']);
  });

  it('stops after one request when the library fits in a single page', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(pageResponse(0, 20, 20));
    vi.stubGlobal('fetch', fetchSpy);

    const { fetchUserArtworks } = await import('./artworks');
    const data = await fetchUserArtworks('user-1');

    expect(data.items).toHaveLength(20);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('throws on a non-OK page instead of returning a partial library', async () => {
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(pageResponse(0, 100, 250))
      .mockResolvedValueOnce(new Response('boom', { status: 500 }));
    vi.stubGlobal('fetch', fetchSpy);

    const { fetchUserArtworks } = await import('./artworks');
    await expect(fetchUserArtworks('user-1')).rejects.toThrow('API error (500)');
  });
});
