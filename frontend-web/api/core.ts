import {
  createApiClient,
  resolveBackendOrigin,
  type ApiRequestOptions,
} from '@musee/client-core';
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
    return null;
  }
  const data = await response.json() as { access_token?: string };
  return data.access_token || null;
}

function notifyAuthenticationRequired(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(REAUTH_REQUIRED_EVENT));
  }
}

const apiClient = createApiClient({
  fetch: (resource, options) => fetch(resource, options),
  defaultTimeoutMs: API_TIMEOUT,
  defaultCredentials: 'include',
  refreshAccessToken: requestAccessToken,
  onAuthenticationRequired: notifyAuthenticationRequired,
});

const { getAccessToken, refreshAccessToken, setAccessToken } = apiClient;

function getLanguage(): string | null {
  return localStorage.getItem('musee_language');
}

async function fetchWithTimeout(resource: RequestInfo | URL, options: ApiRequestOptions = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const resourceLabel = typeof resource === 'string'
    ? resource
    : resource instanceof URL
      ? resource.toString()
      : String(resource);
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    const response = await apiClient.fetchWithTimeout(resource, options);

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
  }
}

function getBaseDomain(): string {
  return resolveBackendOrigin(API_BASE_URL);
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
