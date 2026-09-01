import {
  createApiClient,
  fetchBackendHealth,
  type ApiFetch,
  type BackendHealth,
} from '@musee/client-core';
import { fetch as expoFetch } from 'expo/fetch';

const DEFAULT_MOBILE_API_BASE_URL = 'http://127.0.0.1:8000/api';
const MOBILE_API_TIMEOUT_MS = 10_000;

export const MOBILE_API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || DEFAULT_MOBILE_API_BASE_URL;

const mobileFetch: ApiFetch = (resource, options) => expoFetch(resource, options);

export const mobileApiClient = createApiClient({
  fetch: mobileFetch,
  defaultTimeoutMs: MOBILE_API_TIMEOUT_MS,
  defaultCredentials: 'omit',
});

export function checkBackendHealth(): Promise<BackendHealth> {
  return fetchBackendHealth(mobileApiClient, MOBILE_API_BASE_URL);
}
