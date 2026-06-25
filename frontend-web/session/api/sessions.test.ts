import { afterEach, describe, expect, it, vi } from 'vitest';

describe('fetchSessions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    localStorage.clear();
  });

  it('deduplicates concurrent session list requests for the same user', async () => {
    const fetchSpy = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(JSON.stringify([{ id: 'session-1', user_id: 'user-1', title: 'Session 1' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { fetchSessions } = await import('./sessions');

    const [first, second] = await Promise.all([
      fetchSessions('user-1'),
      fetchSessions('user-1'),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first).toEqual([{ id: 'session-1', user_id: 'user-1', title: 'Session 1' }]);
  });

  it('starts a new request after the previous one settles', async () => {
    const fetchSpy = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify([{ id: 'session-1', user_id: 'user-1', title: 'Session 1' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }))
      );
    vi.stubGlobal('fetch', fetchSpy);

    const { fetchSessions } = await import('./sessions');

    await fetchSessions('user-1');
    await fetchSessions('user-1');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
