import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  REAUTH_REQUIRED_EVENT,
  fetchWithTimeout,
  getAccessToken,
  setAccessToken,
} from './core';


function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}


describe('authenticated API renewal', () => {
  afterEach(() => {
    setAccessToken(null);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shares one refresh across concurrent 401 responses and retries each request once', async () => {
    setAccessToken('expired-access');
    let finishRefresh!: (response: Response) => void;
    const refreshResponse = new Promise<Response>((resolve) => {
      finishRefresh = resolve;
    });
    const resourceAttempts = new Map<string, number>();
    const fetchSpy = vi.fn(async (resource: RequestInfo | URL, options?: RequestInit) => {
      const url = String(resource);
      if (url.endsWith('/auth/refresh')) return refreshResponse;
      const attempt = (resourceAttempts.get(url) || 0) + 1;
      resourceAttempts.set(url, attempt);
      if (attempt === 1) {
        expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer expired-access');
        return jsonResponse({}, 401);
      }
      expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer renewed-access');
      return jsonResponse({ ok: true });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const first = fetchWithTimeout('/api/artworks');
    const second = fetchWithTimeout('/api/sessions');
    await vi.waitFor(() => {
      expect(fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(1);
    });
    finishRefresh(jsonResponse({ access_token: 'renewed-access' }));

    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    expect(resourceAttempts.get('/api/artworks')).toBe(2);
    expect(resourceAttempts.get('/api/sessions')).toBe(2);
    expect(getAccessToken()).toBe('renewed-access');
  });

  it('enters reauthentication when refresh fails', async () => {
    setAccessToken('expired-access');
    const reauthListener = vi.fn();
    window.addEventListener(REAUTH_REQUIRED_EVENT, reauthListener);
    vi.stubGlobal('fetch', vi.fn(async (resource: RequestInfo | URL) => (
      String(resource).endsWith('/auth/refresh')
        ? jsonResponse({}, 401)
        : jsonResponse({}, 401)
    )));

    const response = await fetchWithTimeout('/api/sessions');

    expect(response.status).toBe(401);
    expect(getAccessToken()).toBeNull();
    expect(reauthListener).toHaveBeenCalledTimes(1);
    window.removeEventListener(REAUTH_REQUIRED_EVENT, reauthListener);
  });

  it('does not loop when a retried request still returns 401', async () => {
    setAccessToken('expired-access');
    const reauthListener = vi.fn();
    window.addEventListener(REAUTH_REQUIRED_EVENT, reauthListener);
    const fetchSpy = vi.fn(async (resource: RequestInfo | URL) => (
      String(resource).endsWith('/auth/refresh')
        ? jsonResponse({ access_token: 'renewed-access' })
        : jsonResponse({}, 401)
    ));
    vi.stubGlobal('fetch', fetchSpy);

    const response = await fetchWithTimeout('/api/private');

    assertCallCounts(fetchSpy, 2, 1);
    expect(response.status).toBe(401);
    expect(getAccessToken()).toBeNull();
    expect(reauthListener).toHaveBeenCalledTimes(1);
    window.removeEventListener(REAUTH_REQUIRED_EVENT, reauthListener);
  });
});


function assertCallCounts(fetchSpy: ReturnType<typeof vi.fn>, resourceCount: number, refreshCount: number) {
  expect(fetchSpy.mock.calls.filter(([url]) => !String(url).endsWith('/auth/refresh'))).toHaveLength(resourceCount);
  expect(fetchSpy.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(refreshCount);
}
