import type { ApiClient } from '@musee/client-core';

import type { MobileAuthUser } from './mobileAuthTransport';

export type AuthenticatedSession = {
  state: 'authenticated';
  principal: MobileAuthUser & { kind: 'authenticated' };
};

type SessionResponse = AuthenticatedSession | {
  state: 'guest';
  principal: { kind: 'guest'; user_id: string };
};

const AUTH_SESSION_PATH = '/auth/session';
const SESSION_REQUEST_FAILED_MESSAGE = 'Musee could not restore the signed-in account.';

export class MobileAuthSessionError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(SESSION_REQUEST_FAILED_MESSAGE);
    this.name = 'MobileAuthSessionError';
    this.status = status;
  }
}

export async function fetchAuthenticatedUser(
  apiClient: ApiClient,
  apiBaseUrl: string,
): Promise<MobileAuthUser> {
  const response = await apiClient.fetchWithTimeout(`${apiBaseUrl}${AUTH_SESSION_PATH}`, {
    method: 'GET',
    credentials: 'omit',
  });
  if (!response.ok) {
    throw new MobileAuthSessionError(response.status);
  }

  const session = await response.json() as SessionResponse;
  if (session.state !== 'authenticated' || session.principal.kind !== 'authenticated') {
    throw new MobileAuthSessionError(401);
  }
  return session.principal;
}
