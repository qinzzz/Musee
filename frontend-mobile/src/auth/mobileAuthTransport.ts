import type { ApiFetch } from '@musee/client-core';

export type MobileAuthUser = {
  user_id: string;
  [key: string]: unknown;
};

export type MobileAuthSessionResponse = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  token_type: string;
  user?: MobileAuthUser;
};

export type MobileAuthTransport = {
  loginWithEmail: (email: string, password: string) => Promise<MobileAuthSessionResponse>;
  logout: (refreshToken: string) => Promise<void>;
  refresh: (refreshToken: string) => Promise<MobileAuthSessionResponse>;
};

export type MobileAuthTransportOptions = {
  apiBaseUrl: string;
  fetch: ApiFetch;
};

const CLIENT_PLATFORM_HEADER = 'X-Client-Platform';
const CLIENT_PLATFORM_IOS = 'ios';
const CONTENT_TYPE_HEADER = 'Content-Type';
const JSON_CONTENT_TYPE = 'application/json';
const REFRESH_TOKEN_HEADER = 'X-Refresh-Token';
const LOGIN_PATH = '/auth/login';
const LOGOUT_PATH = '/auth/logout';
const REFRESH_PATH = '/auth/refresh';
const AUTH_REQUEST_FAILED_MESSAGE = 'Musee authentication request failed.';

export class MobileAuthHttpError extends Error {
  readonly code: string | null;
  readonly status: number;

  constructor(status: number, code: string | null) {
    super(AUTH_REQUEST_FAILED_MESSAGE);
    this.name = 'MobileAuthHttpError';
    this.status = status;
    this.code = code;
  }
}

async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const body = await response.json() as { detail?: { error_code?: string } };
    return body.detail?.error_code ?? null;
  } catch {
    return null;
  }
}

export function createMobileAuthTransport({
  apiBaseUrl,
  fetch,
}: MobileAuthTransportOptions): MobileAuthTransport {
  const platformHeaders = {
    [CLIENT_PLATFORM_HEADER]: CLIENT_PLATFORM_IOS,
  };

  async function requireSuccess(response: Response): Promise<Response> {
    if (!response.ok) {
      throw new MobileAuthHttpError(response.status, await readErrorCode(response));
    }
    return response;
  }

  return {
    async loginWithEmail(email, password) {
      const response = await fetch(`${apiBaseUrl}${LOGIN_PATH}`, {
        method: 'POST',
        credentials: 'omit',
        headers: {
          ...platformHeaders,
          [CONTENT_TYPE_HEADER]: JSON_CONTENT_TYPE,
        },
        body: JSON.stringify({ email, password }),
      });
      return (await requireSuccess(response)).json() as Promise<MobileAuthSessionResponse>;
    },

    async logout(refreshToken) {
      const response = await fetch(`${apiBaseUrl}${LOGOUT_PATH}`, {
        method: 'POST',
        credentials: 'omit',
        headers: {
          ...platformHeaders,
          [REFRESH_TOKEN_HEADER]: refreshToken,
        },
      });
      await requireSuccess(response);
    },

    async refresh(refreshToken) {
      const response = await fetch(`${apiBaseUrl}${REFRESH_PATH}`, {
        method: 'POST',
        credentials: 'omit',
        headers: {
          ...platformHeaders,
          [REFRESH_TOKEN_HEADER]: refreshToken,
        },
      });
      return (await requireSuccess(response)).json() as Promise<MobileAuthSessionResponse>;
    },
  };
}
