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
  quota?: string;
  limit?: number | null;
  used?: number;
  resetsAt?: string | null;
  message: string;
};

// Recognizes the backend's structured 402 quota body inside thrown API
// errors ("API error (402): {\"detail\": {...}}"). Returns null for
// anything that isn't a quota rejection.
export function parseQuotaError(error: unknown): QuotaError | null {
  if (!(error instanceof Error) || !error.message.includes('API error (402)')) {
    return null;
  }
  const fallback: QuotaError = { message: 'You have reached your plan limit.' };
  const jsonStart = error.message.indexOf('{');
  if (jsonStart === -1) return fallback;
  try {
    const body = JSON.parse(error.message.slice(jsonStart));
    const detail = body?.detail ?? body;
    if (detail?.error_code !== 'quota_exceeded' && detail?.code !== 'quota_exceeded') {
      return fallback;
    }
    return {
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
