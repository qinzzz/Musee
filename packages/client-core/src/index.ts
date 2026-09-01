export const CLIENT_CORE_VERSION = '0.0.0';

export {
  createApiClient,
  type ApiClient,
  type ApiClientOptions,
  type ApiFetch,
  type ApiRequestOptions,
} from './apiClient';
export {
  ApiHttpError,
  fetchBackendHealth,
  resolveBackendOrigin,
  type BackendHealth,
} from './health';
