import type { AuthCredentialStore } from './AuthCredentialStore';
import type { SecureStorage } from '../platform/storage/secureStorage';
import { AUTH_REFRESH_TOKEN_STORAGE_KEY } from '../platform/storage/storageKeys';

export function createSecureAuthCredentialStore(
  storage: SecureStorage,
): AuthCredentialStore {
  return {
    clearRefreshToken: () => storage.deleteItem(AUTH_REFRESH_TOKEN_STORAGE_KEY),
    getRefreshToken: () => storage.getItem(AUTH_REFRESH_TOKEN_STORAGE_KEY),
    replaceRefreshToken: (token) =>
      storage.setItem(AUTH_REFRESH_TOKEN_STORAGE_KEY, token),
  };
}
