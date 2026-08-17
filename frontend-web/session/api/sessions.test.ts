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

  it('ensureSession persists the caller-provided id before downstream work', async () => {
    const session = {
      id: 'client-session-1',
      user_id: 'user-1',
      title: 'First question',
    };
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ session }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchSpy);

    const { ensureSession } = await import('./sessions');

    await expect(ensureSession('user-1', 'client-session-1', 'First question')).resolves.toEqual(session);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/sessions?user_id=user-1'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          session_id: 'client-session-1',
          title: 'First question',
        }),
      }),
    );
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

  it('preserves structured guest quota errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: {
        error_code: 'guest_quota_exhausted',
        message: 'The guest preview has reached its limit.',
        requires_authentication: true,
      },
    }), { status: 429 })));

    const { appendSessionEvents, SessionPolicyError } = await import('./sessions');

    try {
      await appendSessionEvents('session-1', [{
        id: 'evt-2',
        role: 'user',
        event_type: 'user_input',
        content: 'Another question',
      }]);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(SessionPolicyError);
      expect(error).toMatchObject({
        code: 'guest_quota_exhausted',
        requiresAuthentication: true,
      });
    }
  });

  it('preserves guest quota policy when creating an artwork-first session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: {
        error_code: 'guest_quota_exhausted',
        message: 'The guest preview has reached its limit.',
        requires_authentication: true,
      },
    }), { status: 429 })));

    const { ensureSession, SessionPolicyError } = await import('./sessions');

    await expect(ensureSession('guest-1', 'session-2', 'Another session')).rejects.toMatchObject({
      name: SessionPolicyError.name,
      code: 'guest_quota_exhausted',
      requiresAuthentication: true,
    });
  });
});
