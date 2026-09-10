export type ApiFetch = (
  resource: RequestInfo | URL,
  options?: RequestInit,
) => Promise<Response>;

export type ApiRequestOptions = RequestInit & {
  timeout?: number;
};

export type ApiClientOptions = {
  fetch: ApiFetch;
  defaultTimeoutMs: number;
  defaultCredentials?: RequestCredentials;
  refreshAccessToken?: () => Promise<string | null>;
  onAuthenticationRequired?: () => void;
  isAuthenticationRequest?: (resource: string) => boolean;
};

export type ApiClient = {
  fetchWithTimeout: (
    resource: RequestInfo | URL,
    options?: ApiRequestOptions,
  ) => Promise<Response>;
  getAccessToken: () => string | null;
  setAccessToken: (token: string | null) => void;
  refreshAccessToken: () => Promise<string | null>;
};

const AUTHORIZATION_HEADER = 'Authorization';
const BEARER_PREFIX = 'Bearer';
const DEFAULT_AUTH_PATH = '/auth/';

function resourceToString(resource: RequestInfo | URL): string {
  if (typeof resource === 'string') {
    return resource;
  }
  if (resource instanceof URL) {
    return resource.toString();
  }
  return String(resource);
}

export function createApiClient({
  fetch,
  defaultTimeoutMs,
  defaultCredentials,
  refreshAccessToken: requestAccessToken,
  onAuthenticationRequired,
  isAuthenticationRequest = (resource) => resource.includes(DEFAULT_AUTH_PATH),
}: ApiClientOptions): ApiClient {
  let accessToken: string | null = null;
  let refreshPromise: Promise<string | null> | null = null;

  function setAccessToken(token: string | null): void {
    accessToken = token;
  }

  function getAccessToken(): string | null {
    return accessToken;
  }

  function refreshAccessToken(): Promise<string | null> {
    if (!refreshPromise) {
      refreshPromise = (requestAccessToken?.() ?? Promise.resolve(null))
        .then((token) => {
          setAccessToken(token);
          return token;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }
    return refreshPromise;
  }

  async function fetchWithTimeout(
    resource: RequestInfo | URL,
    options: ApiRequestOptions = {},
  ): Promise<Response> {
    const { timeout = defaultTimeoutMs, ...requestOptions } = options;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const abortFromCaller = () => controller.abort();
    requestOptions.signal?.addEventListener('abort', abortFromCaller, { once: true });
    if (requestOptions.signal?.aborted) controller.abort();
    const headers = new Headers(requestOptions.headers ?? {});
    const resourceLabel = resourceToString(resource);

    if (accessToken) {
      headers.set(AUTHORIZATION_HEADER, `${BEARER_PREFIX} ${accessToken}`);
    }

    const resolvedOptions: RequestInit = {
      ...requestOptions,
      headers,
      credentials: requestOptions.credentials ?? defaultCredentials,
      signal: controller.signal,
    };

    try {
      let response = await fetch(resource, resolvedOptions);

      if (response.status === 401 && accessToken && !isAuthenticationRequest(resourceLabel)) {
        const renewedToken = await refreshAccessToken();
        if (renewedToken) {
          headers.set(AUTHORIZATION_HEADER, `${BEARER_PREFIX} ${renewedToken}`);
          response = await fetch(resource, resolvedOptions);
        }

        if (!renewedToken || response.status === 401) {
          setAccessToken(null);
          onAuthenticationRequired?.();
        }
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
      requestOptions.signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  return {
    fetchWithTimeout,
    getAccessToken,
    setAccessToken,
    refreshAccessToken,
  };
}
