import {
  createApiClient,
  fetchBackendHealth,
  type ApiFetch,
  type BackendHealth,
} from '@musee/client-core';
import * as Device from 'expo-device';
import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';

import { createMobileAuthService } from '../auth/mobileAuthService';
import { createMobileAuthTransport } from '../auth/mobileAuthTransport';
import { createSecureAuthCredentialStore } from '../auth/secureAuthCredentialStore';
import { createMobileRuntimeConfiguration } from '../config/mobileRuntimeConfig';
import { createMobileArtworkAnalysisService } from '../capture/mobileArtworkAnalysisService';
import { createMobileArtworkAnalysisTransport } from '../capture/mobileArtworkAnalysisTransport';
import { createMobileArtworkUploadService } from '../capture/mobileArtworkUploadService';
import { createMobileArtworkUploadTransport } from '../capture/mobileArtworkUploadTransport';
import { expoImageCache } from '../platform/images/imageCache';
import { expoSecureStorage } from '../platform/storage/secureStorage';
import { createMobileArtworkLibraryService } from '../library/mobileArtworkLibraryService';
import { createMobileSessionService } from '../session/mobileSessionService';
import { createMobileSessionTransport } from '../session/mobileSessionTransport';

const MOBILE_API_TIMEOUT_MS = 10_000;
const authenticationRequiredListeners = new Set<() => void>();

export const MOBILE_RUNTIME_CONFIGURATION = createMobileRuntimeConfiguration({
  configuredApiBaseUrl: process.env.EXPO_PUBLIC_API_URL,
  configuredEnvironment: process.env.EXPO_PUBLIC_APP_ENV,
  isDevelopmentBuild: __DEV__,
  isPhysicalDevice: Device.isDevice,
});
export const MOBILE_API_BASE_URL = MOBILE_RUNTIME_CONFIGURATION.apiBaseUrl;

const mobileFetch: ApiFetch = (resource, options) => {
  if (MOBILE_RUNTIME_CONFIGURATION.error) {
    return Promise.reject(MOBILE_RUNTIME_CONFIGURATION.error);
  }
  return expoFetch(resource, options);
};
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
  onAuthenticationRequired: () => {
    authenticationRequiredListeners.forEach((listener) => listener());
  },
});

export const mobileAuthService = createMobileAuthService({
  apiClient: mobileApiClient,
  credentialStore: authCredentialStore,
  transport: mobileAuthTransport,
});

refreshAccessTokenDelegate = () => mobileAuthService.refreshAccessToken();

const mobileArtworkUploadTransport = createMobileArtworkUploadTransport({
  apiBaseUrl: MOBILE_API_BASE_URL,
  apiClient: mobileApiClient,
  createUploadFile: (uri) => new File(uri),
});

export const mobileArtworkUploadService = createMobileArtworkUploadService({
  apiBaseUrl: MOBILE_API_BASE_URL,
  imageCache: expoImageCache,
  transport: mobileArtworkUploadTransport,
});

export const mobileArtworkAnalysisService = createMobileArtworkAnalysisService(
  createMobileArtworkAnalysisTransport({
    apiBaseUrl: MOBILE_API_BASE_URL,
    apiClient: mobileApiClient,
  }),
);

export const mobileArtworkLibraryService = createMobileArtworkLibraryService({
  apiBaseUrl: MOBILE_API_BASE_URL,
  apiClient: mobileApiClient,
});

export const mobileSessionService = createMobileSessionService({
  transport: createMobileSessionTransport({
    apiBaseUrl: MOBILE_API_BASE_URL,
    apiClient: mobileApiClient,
  }),
});

export function checkBackendHealth(): Promise<BackendHealth> {
  return fetchBackendHealth(mobileApiClient, MOBILE_API_BASE_URL);
}

export function subscribeToMobileAuthenticationRequired(
  listener: () => void,
): () => void {
  authenticationRequiredListeners.add(listener);
  return () => authenticationRequiredListeners.delete(listener);
}
