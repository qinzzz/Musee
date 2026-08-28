import { afterEach, describe, expect, it, vi } from 'vitest';

describe('fetchUserMuseums', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('loads the authenticated user museum summaries', async () => {
    const payload = { items: [], count: 0 };
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const { fetchUserMuseums } = await import('./museums');
    await expect(fetchUserMuseums('user with space')).resolves.toEqual(payload);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('user_id=user%20with%20space');
  });

  it('throws instead of returning an empty passport when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('denied', { status: 403 })));
    const { fetchUserMuseums } = await import('./museums');
    await expect(fetchUserMuseums('user-1')).rejects.toThrow('API error (403)');
  });
});
