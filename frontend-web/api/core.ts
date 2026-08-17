import { getApiTimingHeaders, logApiTiming } from './performance';

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL;
  if (configured) {
    return configured;
  }

  return '/api';
}

const API_BASE_URL = resolveApiBaseUrl();
const API_TIMEOUT = 185000;
const AUTH_TOKEN_KEY = 'musee_auth_token';
const USER_INFO_KEY = 'musee_user_info';
const USER_ID_KEY = 'musee_user_id';
const DEV_FIXED_USER_ID = import.meta.env.VITE_DEV_USER_ID || 'musee-dev-user';
const DEV_FREE_TIER_USER_ID = import.meta.env.VITE_DEV_FREE_TIER_USER_ID || 'musee-dev-user-freetier';
const REAUTH_REQUIRED_EVENT = 'musee:reauth-required';

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

function setAccessToken(token: string | null): void {
  accessToken = token;
}

function getAccessToken(): string | null {
  return accessToken;
}

async function requestAccessToken(allowSupersededRetry = true): Promise<string | null> {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (response.status === 409 && allowSupersededRetry) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return requestAccessToken(false);
  }
  if (!response.ok) {
    setAccessToken(null);
    return null;
  }
  const data = await response.json() as { access_token?: string };
  const token = data.access_token || null;
  setAccessToken(token);
  return token;
}

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = requestAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function getLanguage(): string | null {
  return localStorage.getItem('musee_language');
}

async function fetchWithTimeout(resource: RequestInfo | URL, options: RequestInit & { timeout?: number } = {}) {
  const { timeout = API_TIMEOUT } = options;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  const headers = new Headers(options.headers || {});

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const method = (options.method || 'GET').toUpperCase();
  const resourceLabel = typeof resource === 'string'
    ? resource
    : resource instanceof URL
      ? resource.toString()
      : String(resource);
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    let response = await fetch(resource, {
      ...options,
      headers,
      credentials: options.credentials || 'include',
      signal: controller.signal,
    });

    if (response.status === 401 && accessToken && !resourceLabel.includes('/auth/')) {
      const renewedToken = await refreshAccessToken();
      if (renewedToken) {
        headers.set('Authorization', `Bearer ${renewedToken}`);
        response = await fetch(resource, {
          ...options,
          headers,
          credentials: options.credentials || 'include',
          signal: controller.signal,
        });
      }
      if (!renewedToken || response.status === 401) {
        setAccessToken(null);
      }
      if ((!renewedToken || response.status === 401) && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(REAUTH_REQUIRED_EVENT));
      }
    }

    const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
    const { serverTiming, responseTime } = getApiTimingHeaders(response);
    logApiTiming({
      method,
      resource: resourceLabel,
      durationMs,
      status: response.status,
      serverTiming,
      responseTime,
    });

    return response;
  } catch (error) {
    const durationMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start;
    logApiTiming({
      method,
      resource: resourceLabel,
      durationMs,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    throw error;
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
  if (import.meta.env.DEV) {
    if (typeof window === 'undefined') {
      return DEV_FIXED_USER_ID;
    }

    const storedUserId = localStorage.getItem(USER_ID_KEY);
    if (storedUserId) {
      return storedUserId;
    }

    localStorage.setItem(USER_ID_KEY, DEV_FIXED_USER_ID);
    return DEV_FIXED_USER_ID;
  }

  let userId = typeof window !== 'undefined' ? localStorage.getItem(USER_ID_KEY) : null;

  if (!userId) {
    userId = `web-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    if (typeof window !== 'undefined') {
      localStorage.setItem(USER_ID_KEY, userId);
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
  USER_ID_KEY,
  DEV_FIXED_USER_ID,
  DEV_FREE_TIER_USER_ID,
  REAUTH_REQUIRED_EVENT,
  getAccessToken,
  setAccessToken,
  refreshAccessToken,
  getLanguage,
  fetchWithTimeout,
  getBaseDomain,
  resolveImageUrl,
  getOrCreateUserId,
};
