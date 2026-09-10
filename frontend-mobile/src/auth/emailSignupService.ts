import type { ApiClient } from '@musee/client-core';
import { MobileAuthHttpError } from './mobileAuthTransport';

export function createEmailSignupService(client: Pick<ApiClient, 'fetchWithTimeout'>, baseUrl: string) {
  return {
    async signup(email: string, password: string): Promise<{ emailSent: boolean }> {
      const response = await client.fetchWithTimeout(`${baseUrl}/auth/signup`, {
        method: 'POST', credentials: 'omit', timeout: 15_000,
        headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'ios' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const retryAfter = Number(body?.detail?.retry_after_seconds);
        throw new MobileAuthHttpError(response.status, body?.detail?.error_code ?? null,
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined);
      }
      if (body?.ok !== true || body?.verification_required !== true || typeof body?.email_sent !== 'boolean') {
        throw new Error('Unexpected signup response.');
      }
      return { emailSent: body.email_sent };
    },
  };
}
