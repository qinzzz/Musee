import { describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '@musee/client-core';

import {
  fetchAuthenticatedUser,
  MobileAuthSessionError,
} from './mobileAuthSession';

const API_BASE_URL = 'https://api.example.com/api';

function createApiClient(response: Response): ApiClient {
  return {
    fetchWithTimeout: vi.fn().mockResolvedValue(response),
    getAccessToken: vi.fn(),
    setAccessToken: vi.fn(),
    refreshAccessToken: vi.fn(),
  };
}

describe('mobile authenticated session', () => {
  it('returns the authenticated principal', async () => {
    const apiClient = createApiClient(Response.json({
      state: 'authenticated',
      principal: {
        kind: 'authenticated',
        user_id: 'user-1',
        email: 'person@example.com',
      },
    }));

    await expect(fetchAuthenticatedUser(apiClient, API_BASE_URL)).resolves.toMatchObject({
      user_id: 'user-1',
      email: 'person@example.com',
    });
    expect(apiClient.fetchWithTimeout).toHaveBeenCalledWith(
      `${API_BASE_URL}/auth/session`,
      { method: 'GET', credentials: 'omit' },
    );
  });

  it('rejects a guest response after token restoration', async () => {
    const apiClient = createApiClient(Response.json({
      state: 'guest',
      principal: { kind: 'guest', user_id: 'guest-1' },
    }));

    await expect(fetchAuthenticatedUser(apiClient, API_BASE_URL)).rejects.toEqual(
      new MobileAuthSessionError(401),
    );
  });
});
