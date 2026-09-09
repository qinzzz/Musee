import { describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '@musee/client-core';

import type { AuthCredentialStore } from './AuthCredentialStore';
import {
  createMobileAuthService,
  MobileAuthContractError,
} from './mobileAuthService';
import {
  MobileAuthHttpError,
  type MobileAuthSessionResponse,
  type MobileAuthTransport,
} from './mobileAuthTransport';

const INITIAL_REFRESH_TOKEN = 'refresh-v1';
const ROTATED_REFRESH_TOKEN = 'refresh-v2';
const ACCESS_TOKEN = 'access-v2';

function sessionResponse(
  refreshToken = ROTATED_REFRESH_TOKEN,
): MobileAuthSessionResponse {
  return {
    access_token: ACCESS_TOKEN,
    expires_in: 900,
    refresh_token: refreshToken,
    token_type: 'bearer',
  };
}

function createDependencies(refreshToken: string | null = INITIAL_REFRESH_TOKEN) {
  const apiClient: ApiClient = {
    fetchWithTimeout: vi.fn(),
    getAccessToken: vi.fn().mockReturnValue(null),
    setAccessToken: vi.fn(),
    refreshAccessToken: vi.fn(),
  };
  const credentialStore: AuthCredentialStore = {
    clearRefreshToken: vi.fn().mockResolvedValue(undefined),
    getRefreshToken: vi.fn().mockResolvedValue(refreshToken),
    replaceRefreshToken: vi.fn().mockResolvedValue(undefined),
  };
  const transport: MobileAuthTransport = {
    loginWithGoogle: vi.fn().mockResolvedValue(sessionResponse()),
    loginWithEmail: vi.fn().mockResolvedValue(sessionResponse()),
    logout: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(sessionResponse()),
  };

  return { apiClient, credentialStore, transport };
}

describe('mobile auth service', () => {
  it('persists the refresh token before accepting the access token on login', async () => {
    const dependencies = createDependencies();
    const events: string[] = [];
    vi.mocked(dependencies.credentialStore.replaceRefreshToken).mockImplementation(async () => {
      events.push('persist');
    });
    vi.mocked(dependencies.apiClient.setAccessToken).mockImplementation(() => {
      events.push('accept');
    });
    const service = createMobileAuthService(dependencies);

    await service.loginWithEmail('person@example.com', 'password');

    expect(events).toEqual(['persist', 'accept']);
    expect(dependencies.credentialStore.replaceRefreshToken).toHaveBeenCalledWith(
      ROTATED_REFRESH_TOKEN,
    );
    expect(dependencies.apiClient.setAccessToken).toHaveBeenCalledWith(ACCESS_TOKEN);
  });

  it('restores a session by rotating and replacing its stored credential', async () => {
    const dependencies = createDependencies();
    const service = createMobileAuthService(dependencies);

    await expect(service.restoreSession()).resolves.toBe(true);

    expect(dependencies.transport.refresh).toHaveBeenCalledWith(INITIAL_REFRESH_TOKEN);
    expect(dependencies.credentialStore.replaceRefreshToken).toHaveBeenCalledWith(
      ROTATED_REFRESH_TOKEN,
    );
    expect(dependencies.apiClient.setAccessToken).toHaveBeenCalledWith(ACCESS_TOKEN);
  });

  it('returns a signed-out state when no refresh credential exists', async () => {
    const dependencies = createDependencies(null);
    const service = createMobileAuthService(dependencies);

    await expect(service.restoreSession()).resolves.toBe(false);

    expect(dependencies.transport.refresh).not.toHaveBeenCalled();
    expect(dependencies.apiClient.setAccessToken).toHaveBeenCalledWith(null);
  });

  it('forces a clean re-login when a rotated token cannot be persisted', async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.credentialStore.replaceRefreshToken).mockRejectedValue(
      new Error('Keychain write failed'),
    );
    const service = createMobileAuthService(dependencies);

    await expect(service.refreshAccessToken()).rejects.toMatchObject({
      name: 'MobileAuthStorageError',
      operation: 'write',
    });

    expect(dependencies.transport.logout).toHaveBeenCalledWith(ROTATED_REFRESH_TOKEN);
    expect(dependencies.credentialStore.clearRefreshToken).toHaveBeenCalled();
    expect(dependencies.apiClient.setAccessToken).toHaveBeenCalledWith(null);
  });

  it('clears an invalid or superseded session without retrying the old token', async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.transport.refresh).mockRejectedValue(
      new MobileAuthHttpError(409, 'refresh_superseded'),
    );
    const service = createMobileAuthService(dependencies);

    await expect(service.refreshAccessToken()).resolves.toBeNull();

    expect(dependencies.transport.refresh).toHaveBeenCalledTimes(1);
    expect(dependencies.credentialStore.clearRefreshToken).toHaveBeenCalled();
    expect(dependencies.apiClient.setAccessToken).toHaveBeenCalledWith(null);
  });

  it('preserves the stored credential when refresh fails transiently', async () => {
    const dependencies = createDependencies();
    const networkError = new Error('offline');
    vi.mocked(dependencies.transport.refresh).mockRejectedValue(networkError);
    const service = createMobileAuthService(dependencies);

    await expect(service.refreshAccessToken()).rejects.toBe(networkError);

    expect(dependencies.credentialStore.clearRefreshToken).not.toHaveBeenCalled();
    expect(dependencies.apiClient.setAccessToken).not.toHaveBeenCalled();
  });

  it('completes local logout when the server is unreachable', async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.transport.logout).mockRejectedValue(new Error('offline'));
    const service = createMobileAuthService(dependencies);

    await expect(service.logout()).resolves.toBeUndefined();

    expect(dependencies.credentialStore.clearRefreshToken).toHaveBeenCalled();
    expect(dependencies.apiClient.setAccessToken).toHaveBeenCalledWith(null);
    expect(dependencies.transport.logout).toHaveBeenCalledWith(INITIAL_REFRESH_TOKEN);
  });

  it('distinguishes a credential read error from a missing credential', async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.credentialStore.getRefreshToken).mockRejectedValue(
      new Error('Keychain unavailable'),
    );
    const service = createMobileAuthService(dependencies);

    await expect(service.restoreSession()).rejects.toMatchObject({
      name: 'MobileAuthStorageError',
      operation: 'read',
    });
    expect(dependencies.apiClient.setAccessToken).toHaveBeenCalledWith(null);
  });

  it('rejects a native response that omits its refresh token', async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.transport.loginWithEmail).mockResolvedValue({
      ...sessionResponse(),
      refresh_token: '',
    });
    const service = createMobileAuthService(dependencies);

    await expect(
      service.loginWithEmail('person@example.com', 'password'),
    ).rejects.toBeInstanceOf(MobileAuthContractError);
    expect(dependencies.apiClient.setAccessToken).toHaveBeenCalledWith(null);
    expect(dependencies.credentialStore.clearRefreshToken).toHaveBeenCalled();
  });
});

describe('Google login', () => {
  function setup() {
    const dependencies = createDependencies(null);
    const googleIdentityProvider = {
      signIn: vi.fn().mockResolvedValue('google-id-token'),
      signOut: vi.fn().mockResolvedValue(undefined),
    };
    const service = createMobileAuthService({ ...dependencies, googleIdentityProvider });
    return { ...dependencies, googleIdentityProvider, service };
  }

  it('exchanges the Google identity for Musee tokens and persists only the Musee refresh credential', async () => {
    const { service, transport, credentialStore, apiClient, googleIdentityProvider } = setup();
    await service.loginWithGoogle();
    expect(transport.loginWithGoogle).toHaveBeenCalledWith('google-id-token');
    expect(credentialStore.replaceRefreshToken).toHaveBeenCalledWith(ROTATED_REFRESH_TOKEN);
    expect(apiClient.setAccessToken).toHaveBeenCalledWith(ACCESS_TOKEN);
    expect(googleIdentityProvider.signOut).toHaveBeenCalledOnce();
  });

  it('treats cancellation as a no-op without calling the backend or changing credentials', async () => {
    const { service, transport, credentialStore, googleIdentityProvider } = setup();
    googleIdentityProvider.signIn.mockResolvedValue(null);
    await expect(service.loginWithGoogle()).resolves.toBeNull();
    expect(transport.loginWithGoogle).not.toHaveBeenCalled();
    expect(credentialStore.replaceRefreshToken).not.toHaveBeenCalled();
  });

  it('does not accept a rejected Google token and clears SDK state after failure', async () => {
    const { service, transport, credentialStore, googleIdentityProvider } = setup();
    vi.mocked(transport.loginWithGoogle).mockRejectedValue(new MobileAuthHttpError(401, 'google_sign_in_failed'));
    await expect(service.loginWithGoogle()).rejects.toMatchObject({ status: 401 });
    expect(credentialStore.replaceRefreshToken).not.toHaveBeenCalled();
    expect(googleIdentityProvider.signOut).toHaveBeenCalledOnce();
  });

  it('revokes the Musee session if Keychain persistence fails', async () => {
    const { service, transport, credentialStore, apiClient } = setup();
    vi.mocked(credentialStore.replaceRefreshToken).mockRejectedValue(new Error('Keychain unavailable'));
    await expect(service.loginWithGoogle()).rejects.toMatchObject({ operation: 'write' });
    expect(transport.logout).toHaveBeenCalledWith(ROTATED_REFRESH_TOKEN);
    expect(apiClient.setAccessToken).not.toHaveBeenCalledWith(ACCESS_TOKEN);
  });

  it('restores Google-created accounts using Musee refresh tokens without silent Google login', async () => {
    const { service, transport, credentialStore, googleIdentityProvider } = setup();
    vi.mocked(credentialStore.getRefreshToken).mockResolvedValue(ROTATED_REFRESH_TOKEN);
    await expect(service.restoreSession()).resolves.toBe(true);
    expect(transport.refresh).toHaveBeenCalledWith(ROTATED_REFRESH_TOKEN);
    expect(googleIdentityProvider.signIn).not.toHaveBeenCalled();
  });
});
