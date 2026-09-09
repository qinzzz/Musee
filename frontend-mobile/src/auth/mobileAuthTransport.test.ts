import { describe, expect, it, vi } from 'vitest';

import type { ApiFetch } from '@musee/client-core';

import {
  createMobileAuthTransport,
  MobileAuthHttpError,
} from './mobileAuthTransport';

const API_BASE_URL = 'https://api.example.com/api';
const SESSION_RESPONSE = {
  access_token: 'access-token',
  expires_in: 900,
  refresh_token: 'refresh-token',
  token_type: 'bearer',
};

describe('mobile auth transport', () => {
  it('marks email login as iOS and omits browser credentials', async () => {
    const fetch = vi.fn<ApiFetch>().mockResolvedValue(Response.json(SESSION_RESPONSE));
    const transport = createMobileAuthTransport({ apiBaseUrl: API_BASE_URL, fetch });

    await expect(
      transport.loginWithEmail('person@example.com', 'secret-password'),
    ).resolves.toEqual(SESSION_RESPONSE);

    const [resource, options] = fetch.mock.calls[0] ?? [];
    const headers = new Headers(options?.headers);
    expect(resource).toBe(`${API_BASE_URL}/auth/login`);
    expect(options?.credentials).toBe('omit');
    expect(headers.get('X-Client-Platform')).toBe('ios');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(options?.body))).toEqual({
      email: 'person@example.com',
      password: 'secret-password',
    });
  });

  it('presents the stored credential when refreshing and logging out', async () => {
    const fetch = vi.fn<ApiFetch>().mockResolvedValue(Response.json(SESSION_RESPONSE));
    const transport = createMobileAuthTransport({ apiBaseUrl: API_BASE_URL, fetch });

    await transport.refresh('stored-refresh-token');
    await transport.logout('stored-refresh-token');

    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, options] of fetch.mock.calls) {
      const headers = new Headers(options?.headers);
      expect(headers.get('X-Client-Platform')).toBe('ios');
      expect(headers.get('X-Refresh-Token')).toBe('stored-refresh-token');
      expect(options?.credentials).toBe('omit');
    }
  });

  it('preserves the backend error code in a typed HTTP error', async () => {
    const fetch = vi.fn<ApiFetch>().mockResolvedValue(Response.json(
      { detail: { error_code: 'invalid_credentials' } },
      { status: 401 },
    ));
    const transport = createMobileAuthTransport({ apiBaseUrl: API_BASE_URL, fetch });

    await expect(
      transport.loginWithEmail('person@example.com', 'wrong-password'),
    ).rejects.toEqual(new MobileAuthHttpError(401, 'invalid_credentials'));
  });
});

it('exchanges a Google ID token using the native login contract', async () => {
  const fetch = vi.fn<ApiFetch>().mockResolvedValue(Response.json(SESSION_RESPONSE));
  const transport = createMobileAuthTransport({ apiBaseUrl: API_BASE_URL, fetch });
  await expect(transport.loginWithGoogle('google-token')).resolves.toEqual(SESSION_RESPONSE);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe(`${API_BASE_URL}/auth/google`);
  expect(new Headers(options?.headers).get('X-Client-Platform')).toBe('ios');
  expect(options?.credentials).toBe('omit');
  expect(JSON.parse(String(options?.body))).toEqual({ id_token: 'google-token' });
});

it('distinguishes Google verification failure from an incorrect email password', async () => {
  const fetch = vi.fn<ApiFetch>().mockResolvedValue(Response.json({ detail: 'Invalid token' }, { status: 401 }));
  const transport = createMobileAuthTransport({ apiBaseUrl: API_BASE_URL, fetch });
  await expect(transport.loginWithGoogle('bad-token')).rejects.toEqual(
    new MobileAuthHttpError(401, 'google_sign_in_failed'));
});
