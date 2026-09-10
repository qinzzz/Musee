import type { ApiClient } from './apiClient';
import { ApiHttpError } from './health';

export interface QuotaEntry {
  limit: number | null;
  used: number;
  period: 'day' | 'month' | 'lifetime';
  resets_at: string | null;
  warning: boolean;
  exceeded: boolean;
  on_exceed: 'block' | 'warn' | 'allow';
}

export interface AccountUsage {
  tier: string;
  quotas: Record<string, QuotaEntry>;
}

const USAGE_TIMEOUT_MS = 8000;
export function createAccountService(client: Pick<ApiClient, 'fetchWithTimeout'>, baseUrl: string) {
  return {
    async usage(userId: string): Promise<AccountUsage> {
      const response = await client.fetchWithTimeout(`${baseUrl}/users/${encodeURIComponent(userId)}/quota`, {
        timeout: USAGE_TIMEOUT_MS,
      });
      if (!response.ok) throw new ApiHttpError('Musee could not load account usage.', response.status);
      return response.json();
    },
  };
}

export function getMeteredQuotas(usage: AccountUsage): [string, QuotaEntry][] {
  return Object.entries(usage.quotas).filter(([, entry]) => entry.limit !== null && entry.on_exceed !== 'allow');
}
