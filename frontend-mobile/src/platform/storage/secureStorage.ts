import * as SecureStore from 'expo-secure-store';

export type SecureStorage = {
  deleteItem: (key: string) => Promise<void>;
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED,
};

const SECURE_STORAGE_UNAVAILABLE_MESSAGE =
  'Secure credential storage is unavailable on this device.';

export class SecureStorageUnavailableError extends Error {
  constructor() {
    super(SECURE_STORAGE_UNAVAILABLE_MESSAGE);
    this.name = 'SecureStorageUnavailableError';
  }
}

let availabilityPromise: Promise<boolean> | null = null;

async function ensureSecureStorageAvailable(): Promise<void> {
  availabilityPromise ??= SecureStore.isAvailableAsync();
  if (!(await availabilityPromise)) {
    throw new SecureStorageUnavailableError();
  }
}

export const expoSecureStorage: SecureStorage = {
  async deleteItem(key) {
    await ensureSecureStorageAvailable();
    await SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS);
  },
  async getItem(key) {
    await ensureSecureStorageAvailable();
    return SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS);
  },
  async setItem(key, value) {
    await ensureSecureStorageAvailable();
    await SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS);
  },
};
