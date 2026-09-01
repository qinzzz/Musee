import { describe, expect, it, vi } from 'vitest';

import { createApiClient, type ApiFetch } from './apiClient';

const API_URL = 'https://example.com/api/artworks';
const UNAUTHORIZED = 401;
const OK = 200;

describe('createApiClient', () => {
  it('shares one token refresh across concurrent unauthorized requests', async () => {
    const fetch = vi.fn<ApiFetch>()
      .mockResolvedValueOnce(new Response(null, { status: UNAUTHORIZED }))
      .mockResolvedValueOnce(new Response(null, { status: UNAUTHORIZED }))
      .mockResolvedValue(new Response(null, { status: OK }));
    const requestAccessToken = vi.fn().mockResolvedValue('renewed-token');
    const client = createApiClient({
      fetch,
      defaultTimeoutMs: 1_000,
      refreshAccessToken: requestAccessToken,
    });
    client.setAccessToken('expired-token');

    const responses = await Promise.all([
      client.fetchWithTimeout(API_URL),
      client.fetchWithTimeout(API_URL),
    ]);

    expect(requestAccessToken).toHaveBeenCalledTimes(1);
    expect(responses.map((response) => response.status)).toEqual([OK, OK]);
    expect(client.getAccessToken()).toBe('renewed-token');
    expect(fetch).toHaveBeenCalledTimes(4);
    const retriedHeaders = new Headers(fetch.mock.calls[2]?.[1]?.headers);
    expect(retriedHeaders.get('Authorization')).toBe('Bearer renewed-token');
  });

  it('clears authentication and notifies when refresh cannot renew the token', async () => {
    const fetch = vi.fn<ApiFetch>().mockResolvedValue(
      new Response(null, { status: UNAUTHORIZED }),
    );
    const onAuthenticationRequired = vi.fn();
    const client = createApiClient({
      fetch,
      defaultTimeoutMs: 1_000,
      refreshAccessToken: vi.fn().mockResolvedValue(null),
      onAuthenticationRequired,
    });
    client.setAccessToken('expired-token');

    const response = await client.fetchWithTimeout(API_URL);

    expect(response.status).toBe(UNAUTHORIZED);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(client.getAccessToken()).toBeNull();
    expect(onAuthenticationRequired).toHaveBeenCalledTimes(1);
  });

  it('retries only once when the renewed token is also unauthorized', async () => {
    const fetch = vi.fn<ApiFetch>().mockResolvedValue(
      new Response(null, { status: UNAUTHORIZED }),
    );
    const onAuthenticationRequired = vi.fn();
    const client = createApiClient({
      fetch,
      defaultTimeoutMs: 1_000,
      refreshAccessToken: vi.fn().mockResolvedValue('renewed-token'),
      onAuthenticationRequired,
    });
    client.setAccessToken('expired-token');

    const response = await client.fetchWithTimeout(API_URL);

    expect(response.status).toBe(UNAUTHORIZED);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(client.getAccessToken()).toBeNull();
    expect(onAuthenticationRequired).toHaveBeenCalledTimes(1);
  });

  it('uses the configured credentials unless the request overrides them', async () => {
    const fetch = vi.fn<ApiFetch>().mockResolvedValue(
      new Response(null, { status: OK }),
    );
    const client = createApiClient({
      fetch,
      defaultTimeoutMs: 1_000,
      defaultCredentials: 'include',
    });

    await client.fetchWithTimeout(API_URL);
    await client.fetchWithTimeout(API_URL, { credentials: 'omit' });

    expect(fetch.mock.calls[0]?.[1]?.credentials).toBe('include');
    expect(fetch.mock.calls[1]?.[1]?.credentials).toBe('omit');
  });
});
