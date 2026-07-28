import { afterEach, describe, expect, it, vi } from 'vitest';

// Request dedupe moved to the shared query layer (useSessionsQuery); the API
// functions are plain fetches that throw on non-OK responses so callers keep
// their last-good data instead of treating an outage as an empty list.
describe('sessions api', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('fetchSessions returns the parsed session list', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: 'session-1', user_id: 'user-1', title: 'Session 1' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    const { fetchSessions } = await import('./sessions');

    await expect(fetchSessions('user-1')).resolves.toEqual([
      { id: 'session-1', user_id: 'user-1', title: 'Session 1' },
    ]);
  });

  it('fetchSessions throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));

    const { fetchSessions } = await import('./sessions');

    await expect(fetchSessions('user-1')).rejects.toThrow('API error (500)');
  });

  it('fetchSessionEvents throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 502 })));

    const { fetchSessionEvents } = await import('./sessions');

    await expect(fetchSessionEvents('session-1')).rejects.toThrow('API error (502)');
  });

  it('appendSessionEvents throws on a non-OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not saved', { status: 500 })));

    const { appendSessionEvents } = await import('./sessions');

    await expect(appendSessionEvents('session-1', [{
      id: 'evt-1',
      role: 'model',
      event_type: 'model_response',
      content: 'Response',
      payload: { status: 'completed' },
    }])).rejects.toThrow('API error (500): not saved');
  });
});
