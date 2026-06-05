const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const API_TIMEOUT = 185000;
const AUTH_TOKEN_KEY = 'musee_auth_token';
const USER_INFO_KEY = 'musee_user_info';
const DEV_FIXED_USER_ID = import.meta.env.VITE_DEV_USER_ID || 'musee-dev-user';

function getLanguage(): string | null {
  return localStorage.getItem('musee_language');
}

async function fetchWithTimeout(resource: RequestInfo | URL, options: RequestInit & { timeout?: number } = {}) {
  const { timeout = API_TIMEOUT } = options;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const response = await fetch(resource, {
      ...options,
      headers,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

function getBaseDomain(): string {
  return API_BASE_URL.replace(/\/api$/, '');
}

function resolveImageUrl(photoUri: string | undefined): string {
  if (!photoUri) return '';
  if (photoUri.startsWith('http') || photoUri.startsWith('data:') || photoUri.startsWith('blob:')) {
    return photoUri;
  }

  const baseDomain = getBaseDomain();
  const cleanBase = baseDomain.endsWith('/') ? baseDomain.slice(0, -1) : baseDomain;
  const cleanPath = photoUri.startsWith('/') ? photoUri.slice(1) : photoUri;
  return `${cleanBase}/${cleanPath}`;
}

function getOrCreateUserId(): string {
  const storageKey = 'musee_user_id';

  if (import.meta.env.DEV) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, DEV_FIXED_USER_ID);
    }
    return DEV_FIXED_USER_ID;
  }

  let userId = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;

  if (!userId) {
    userId = `web-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, userId);
      console.log('Generated new persistent user ID:', userId);
    }
  }

  return userId;
}

export {
  API_BASE_URL,
  API_TIMEOUT,
  AUTH_TOKEN_KEY,
  USER_INFO_KEY,
  DEV_FIXED_USER_ID,
  getLanguage,
  fetchWithTimeout,
  getBaseDomain,
  resolveImageUrl,
  getOrCreateUserId,
};
