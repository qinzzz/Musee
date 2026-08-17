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
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('signup relies on the credential-bound guest cookie instead of a device id', async () => {
    localStorage.setItem('musee_user_id', 'device-42');
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchSpy);

    const { signupWithEmail } = await import('./auth');
    await signupWithEmail('ada@example.com', 'correct-horse');

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toEqual({ email: 'ada@example.com', password: 'correct-horse' });
  });

  it('login keeps the access token in memory and removes legacy auth storage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      access_token: 'jwt-123',
      token_type: 'bearer',
      user: { user_id: 'u1', email: 'ada@example.com' },
    })));

    const { loginWithEmail } = await import('./auth');
    const { getAccessToken } = await import('./core');
    await loginWithEmail('ada@example.com', 'correct-horse');

    expect(getAccessToken()).toBe('jwt-123');
    expect(localStorage.getItem('musee_user_id')).toBe('u1');
    expect(localStorage.getItem('musee_auth_token')).toBeNull();
    expect(localStorage.getItem('musee_user_info')).toBeNull();
  });

  it('reset relies on the credential-bound guest cookie instead of a device id', async () => {
    localStorage.setItem('musee_user_id', 'device-7');
    const fetchSpy = vi.fn().mockResolvedValue(jsonResponse({ access_token: 'j', user: { user_id: 'u9' } }));
    vi.stubGlobal('fetch', fetchSpy);

    const { resetPassword } = await import('./auth');
    await resetPassword('tok', 'new-password-1');

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toEqual({ token: 'tok', new_password: 'new-password-1' });
  });

  it('verify and reset also store the session (auto-login)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      access_token: 'jwt-456', user: { user_id: 'u2' },
    })));

    const { verifyEmailToken } = await import('./auth');
    const { getAccessToken } = await import('./core');
    await verifyEmailToken('some-token');
    expect(getAccessToken()).toBe('jwt-456');
  });

  it('stores and consumes a one-time post-auth welcome', async () => {
    const { consumePostAuthWelcome, rememberPostAuthWelcome } = await import('./auth');

    rememberPostAuthWelcome(true);

    expect(consumePostAuthWelcome()).toBe('new');
    expect(consumePostAuthWelcome()).toBeNull();
  });

  it('consumes and removes a successful Google redirect result from the URL', async () => {
    window.history.replaceState({}, '', '/?google_auth=success&welcome=new');
    const { consumeGoogleRedirectResult } = await import('./auth');

    expect(consumeGoogleRedirectResult()).toEqual({ status: 'success', welcome: 'new' });
    expect(window.location.search).toBe('');
    expect(consumeGoogleRedirectResult()).toBeNull();
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

  it('classifies a rejected Google credential separately from an interrupted Google flow', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(
      { detail: 'Could not validate Google token' },
      401,
    )));

    const { AuthDiagnosticError, loginWithGoogle } = await import('./auth');

    await expect(loginWithGoogle('invalid-google-token')).rejects.toMatchObject({
      name: AuthDiagnosticError.name,
      code: 'google_credential_rejected',
      status: 401,
      message: 'Musee’s server could not verify the Google credential.',
    });
  });

  it('identifies a missing refresh cookie while verifying a completed login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 401)));

    const { bootstrapAuthSession } = await import('./auth');

    await expect(bootstrapAuthSession({ requireAuthenticatedSession: true })).rejects.toMatchObject({
      code: 'session_cookie_blocked',
      message: 'Your browser blocked the Musee session cookie.',
    });
  });
});
