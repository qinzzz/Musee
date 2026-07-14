import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Some jsdom/Node combinations don't expose a working localStorage (opaque
// origin); the app and many tests assume it exists. Provide an in-memory
// shim so the suite is robust across local toolchains.
function ensureLocalStorage() {
  try {
    globalThis.localStorage.getItem('__probe__');
    return;
  } catch {
    // fall through to install the shim
  }
  let store = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return store.size;
    },
    clear: () => {
      store = new Map();
    },
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: shim, configurable: true });
}

ensureLocalStorage();

afterEach(() => {
  cleanup();
});
