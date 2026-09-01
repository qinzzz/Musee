import {
  createApiClient,
  fetchBackendHealth,
  type ApiFetch,
  type BackendHealth,
} from '@musee/client-core';
import { fetch as expoFetch } from 'expo/fetch';

import { createMobileAuthService } from '../auth/mobileAuthService';
import { createMobileAuthTransport } from '../auth/mobileAuthTransport';
import { createSecureAuthCredentialStore } from '../auth/secureAuthCredentialStore';
import { expoSecureStorage } from '../platform/storage/secureStorage';

const DEFAULT_MOBILE_API_BASE_URL = 'http://127.0.0.1:8000/api';
const MOBILE_API_TIMEOUT_MS = 10_000;

export const MOBILE_API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || DEFAULT_MOBILE_API_BASE_URL;

const mobileFetch: ApiFetch = (resource, options) => expoFetch(resource, options);
const authCredentialStore = createSecureAuthCredentialStore(expoSecureStorage);
const mobileAuthHttpClient = createApiClient({
  fetch: mobileFetch,
  defaultTimeoutMs: MOBILE_API_TIMEOUT_MS,
  defaultCredentials: 'omit',
});
const mobileAuthTransport = createMobileAuthTransport({
  apiBaseUrl: MOBILE_API_BASE_URL,
  fetch: (resource, options) => mobileAuthHttpClient.fetchWithTimeout(resource, options),
});
let refreshAccessTokenDelegate: () => Promise<string | null> = async () => null;

export const mobileApiClient = createApiClient({
  fetch: mobileFetch,
  defaultTimeoutMs: MOBILE_API_TIMEOUT_MS,
  defaultCredentials: 'omit',
  refreshAccessToken: () => refreshAccessTokenDelegate(),
});

export const mobileAuthService = createMobileAuthService({
  apiClient: mobileApiClient,
  credentialStore: authCredentialStore,
  transport: mobileAuthTransport,
});

refreshAccessTokenDelegate = () => mobileAuthService.refreshAccessToken();

export function checkBackendHealth(): Promise<BackendHealth> {
  return fetchBackendHealth(mobileApiClient, MOBILE_API_BASE_URL);
}
