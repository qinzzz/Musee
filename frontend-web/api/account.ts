import { API_BASE_URL, fetchWithTimeout } from './core';

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

export async function fetchAccountUsage(userId: string): Promise<AccountUsage> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/quota`, { timeout: 8000 });
  if (!response.ok) {
    throw new Error(`API error (${response.status}): failed to fetch account usage`);
  }
  return response.json();
}

export type QuotaError = {
  code?: 'quota_exceeded' | 'guest_quota_exhausted';
  quota?: string;
  limit?: number | null;
  used?: number;
  resetsAt?: string | null;
  message: string;
};

// Recognizes signed-in plan limits (402) and guest preview limits (429).
export function parseQuotaError(error: unknown): QuotaError | null {
  if (
    !(error instanceof Error)
    || (!error.message.includes('API error (402)') && !error.message.includes('API error (429)'))
  ) {
    return null;
  }
  const isGuestLimit = error.message.includes('API error (429)');
  const fallback: QuotaError = {
    code: isGuestLimit ? 'guest_quota_exhausted' : 'quota_exceeded',
    message: isGuestLimit
      ? 'You’ve used the artwork in your guest preview. Sign in to continue.'
      : 'You have reached your plan limit.',
  };
  const jsonStart = error.message.indexOf('{');
  if (jsonStart === -1) return fallback;
  try {
    const body = JSON.parse(error.message.slice(jsonStart));
    const detail = body?.detail ?? body;
    const code = detail?.error_code ?? detail?.code;
    if (code !== 'quota_exceeded' && code !== 'guest_quota_exhausted') {
      return fallback;
    }
    return {
      code,
      quota: detail.quota,
      limit: detail.limit,
      used: detail.used,
      resetsAt: detail.resets_at ?? null,
      message: detail.message || fallback.message,
    };
  } catch {
    return fallback;
  }
}
