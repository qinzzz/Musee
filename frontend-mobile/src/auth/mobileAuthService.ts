import type { ApiClient } from '@musee/client-core';

import type { GoogleIdentityProvider } from './googleSignIn';
import { GoogleSignInError } from './googleSignIn';
import type { AuthCredentialStore } from './AuthCredentialStore';
import {
  MobileAuthHttpError,
  type MobileAuthSessionResponse,
  type MobileAuthTransport,
} from './mobileAuthTransport';

export type MobileAuthService = {
  loginWithGoogle: () => Promise<MobileAuthSessionResponse | null>;
  loginWithEmail: (email: string, password: string) => Promise<MobileAuthSessionResponse>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
  restoreSession: () => Promise<boolean>;
};

export type MobileAuthServiceOptions = {
  apiClient: ApiClient;
  credentialStore: AuthCredentialStore;
  transport: MobileAuthTransport;
  googleIdentityProvider?: GoogleIdentityProvider;
};

export type AuthCredentialOperation = 'clear' | 'read' | 'write';

const AUTH_CONTRACT_ERROR_MESSAGE =
  'The authentication response did not include the required native tokens.';
const AUTH_STORAGE_ERROR_MESSAGE = 'The authentication credential could not be stored safely.';
const TERMINAL_AUTH_STATUSES = new Set([401, 409]);

export class MobileAuthContractError extends Error {
  constructor() {
    super(AUTH_CONTRACT_ERROR_MESSAGE);
    this.name = 'MobileAuthContractError';
  }
}

export class MobileAuthStorageError extends Error {
  readonly operation: AuthCredentialOperation;

  constructor(operation: AuthCredentialOperation, options?: ErrorOptions) {
    super(AUTH_STORAGE_ERROR_MESSAGE, options);
    this.name = 'MobileAuthStorageError';
    this.operation = operation;
  }
}

function isTerminalAuthError(error: unknown): error is MobileAuthHttpError {
  return error instanceof MobileAuthHttpError && TERMINAL_AUTH_STATUSES.has(error.status);
}

export function createMobileAuthService({
  apiClient,
  credentialStore,
  transport,
  googleIdentityProvider,
}: MobileAuthServiceOptions): MobileAuthService {
  async function clearLocalSession(): Promise<void> {
    apiClient.setAccessToken(null);
    try {
      await credentialStore.clearRefreshToken();
    } catch (cause) {
      throw new MobileAuthStorageError('clear', { cause });
    }
  }

  async function persistSession(response: MobileAuthSessionResponse): Promise<void> {
    if (!response.access_token || !response.refresh_token) {
      apiClient.setAccessToken(null);
      await credentialStore.clearRefreshToken().catch(() => undefined);
      throw new MobileAuthContractError();
    }

    try {
      await credentialStore.replaceRefreshToken(response.refresh_token);
    } catch (cause) {
      apiClient.setAccessToken(null);
      await transport.logout(response.refresh_token).catch(() => undefined);
      await credentialStore.clearRefreshToken().catch(() => undefined);
      throw new MobileAuthStorageError('write', { cause });
    }

    apiClient.setAccessToken(response.access_token);
  }

  async function readRefreshToken(): Promise<string | null> {
    try {
      return await credentialStore.getRefreshToken();
    } catch (cause) {
      apiClient.setAccessToken(null);
      throw new MobileAuthStorageError('read', { cause });
    }
  }

  async function refreshAccessToken(): Promise<string | null> {
    const refreshToken = await readRefreshToken();
    if (!refreshToken) {
      apiClient.setAccessToken(null);
      return null;
    }

    try {
      const response = await transport.refresh(refreshToken);
      await persistSession(response);
      return response.access_token;
    } catch (error) {
      if (isTerminalAuthError(error)) {
        await clearLocalSession();
        return null;
      }
      throw error;
    }
  }

  return {
    async loginWithGoogle() {
      if (!googleIdentityProvider) throw new GoogleSignInError('unavailable');
      try {
        const idToken = await googleIdentityProvider.signIn();
        if (!idToken) return null;
        const response = await transport.loginWithGoogle(idToken);
        await persistSession(response);
        return response;
      } finally {
        // Never use Google's cached credentials to restore a Musee session.
        await googleIdentityProvider.signOut().catch(() => undefined);
      }
    },
    async loginWithEmail(email, password) {
      const response = await transport.loginWithEmail(email, password);
      await persistSession(response);
      return response;
    },

    async logout() {
      let refreshToken: string | null = null;
      try {
        refreshToken = await credentialStore.getRefreshToken();
      } catch {
        // Deleting the key is authoritative for local logout, even if reading it failed.
      }

      await clearLocalSession();
      await googleIdentityProvider?.signOut().catch(() => undefined);
      if (refreshToken) {
        await transport.logout(refreshToken).catch(() => undefined);
      }
    },

    refreshAccessToken,

    async restoreSession() {
      return (await refreshAccessToken()) !== null;
    },
  };
}
