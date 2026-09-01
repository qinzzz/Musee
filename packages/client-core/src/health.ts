import type { ApiClient } from './apiClient';

export type BackendHealth = {
  status: string;
  ai_provider: string;
  database_enabled: boolean;
};

const API_PATH_SUFFIX = '/api';
const HEALTH_PATH = '/health';
const HEALTH_REQUEST_FAILED_MESSAGE = 'Musee backend health check failed.';

export class ApiHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
  }
}

export function resolveBackendOrigin(apiBaseUrl: string): string {
  const normalizedBaseUrl = apiBaseUrl.endsWith('/')
    ? apiBaseUrl.slice(0, -1)
    : apiBaseUrl;
  return normalizedBaseUrl.endsWith(API_PATH_SUFFIX)
    ? normalizedBaseUrl.slice(0, -API_PATH_SUFFIX.length)
    : normalizedBaseUrl;
}

export async function fetchBackendHealth(
  client: ApiClient,
  apiBaseUrl: string,
): Promise<BackendHealth> {
  const response = await client.fetchWithTimeout(
    `${resolveBackendOrigin(apiBaseUrl)}${HEALTH_PATH}`,
  );
  if (!response.ok) {
    throw new ApiHttpError(HEALTH_REQUEST_FAILED_MESSAGE, response.status);
  }
  return response.json() as Promise<BackendHealth>;
}
