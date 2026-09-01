import { describe, expect, it, vi } from 'vitest';

import type { SecureStorage } from '../platform/storage/secureStorage';
import { AUTH_REFRESH_TOKEN_STORAGE_KEY } from '../platform/storage/storageKeys';
import { createSecureAuthCredentialStore } from './secureAuthCredentialStore';

describe('secure auth credential store', () => {
  it('owns the versioned refresh-token key behind a purpose-specific API', async () => {
    const storage: SecureStorage = {
      deleteItem: vi.fn().mockResolvedValue(undefined),
      getItem: vi.fn().mockResolvedValue('stored-token'),
      setItem: vi.fn().mockResolvedValue(undefined),
    };
    const store = createSecureAuthCredentialStore(storage);

    await expect(store.getRefreshToken()).resolves.toBe('stored-token');
    await store.replaceRefreshToken('rotated-token');
    await store.clearRefreshToken();

    expect(storage.getItem).toHaveBeenCalledWith(AUTH_REFRESH_TOKEN_STORAGE_KEY);
    expect(storage.setItem).toHaveBeenCalledWith(
      AUTH_REFRESH_TOKEN_STORAGE_KEY,
      'rotated-token',
    );
    expect(storage.deleteItem).toHaveBeenCalledWith(AUTH_REFRESH_TOKEN_STORAGE_KEY);
  });
});
