import type { ApiClient } from '@musee/client-core';
import { MobileAuthHttpError } from './mobileAuthTransport';

const RESET_PATH = '/auth/request-password-reset';
const RESET_TIMEOUT_MS = 15_000;

export function createPasswordRecoveryService(client: Pick<ApiClient, 'fetchWithTimeout'>, baseUrl: string) {
  return {
    async requestReset(email: string): Promise<void> {
      const response = await client.fetchWithTimeout(`${baseUrl}${RESET_PATH}`, {
        method: 'POST', credentials: 'omit', timeout: RESET_TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'ios' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const retryAfter = Number(body?.detail?.retry_after_seconds);
        throw new MobileAuthHttpError(response.status, null,
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined);
      }
      const payload = await response.json();
      if (payload?.ok !== true) throw new Error('Unexpected password reset response.');
    },
  };
}
