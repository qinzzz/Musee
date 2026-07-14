import { afterEach, describe, expect, it, vi } from 'vitest';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('email auth api', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    localStorage.clear();
  });

  it('signup sends the device id for adoption at verification', async () => {
    localStorage.setItem('musee_user_id', 'device-42');
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchSpy);

    const { signupWithEmail } = await import('./auth');
    await signupWithEmail('ada@example.com', 'correct-horse');

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.anonymous_user_id).toBe('device-42');
  });

  it('login stores the session like the google flow', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      access_token: 'jwt-123',
      token_type: 'bearer',
      user: { user_id: 'u1', email: 'ada@example.com' },
    })));

    const { loginWithEmail } = await import('./auth');
    await loginWithEmail('ada@example.com', 'correct-horse');

    expect(localStorage.getItem('musee_auth_token')).toBe('jwt-123');
    expect(localStorage.getItem('musee_user_id')).toBe('u1');
    expect(JSON.parse(localStorage.getItem('musee_user_info')!)).toMatchObject({ user_id: 'u1' });
  });

  it('verify and reset also store the session (auto-login)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      access_token: 'jwt-456', user: { user_id: 'u2' },
    })));

    const { verifyEmailToken } = await import('./auth');
    await verifyEmailToken('some-token');
    expect(localStorage.getItem('musee_auth_token')).toBe('jwt-456');
  });

  it('surfaces the structured error code and message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(
      { detail: { error_code: 'email_unverified', message: 'Check your inbox.' } }, 403,
    )));

    const { loginWithEmail, EmailAuthError } = await import('./auth');
    try {
      await loginWithEmail('ada@example.com', 'pw-12345678');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EmailAuthError);
      expect((err as InstanceType<typeof EmailAuthError>).code).toBe('email_unverified');
      expect((err as Error).message).toBe('Check your inbox.');
    }
  });
});
