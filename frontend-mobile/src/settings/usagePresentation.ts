import type { QuotaEntry } from '@musee/client-core';

export const USAGE_LABELS: Record<string, string> = {
  artwork_uploads: 'Uploads today',
  stored_artworks: 'Artworks stored',
  tokens: 'AI usage this month',
};

export function usageFraction(entry: QuotaEntry): number {
  if (entry.limit === null) return 0;
  if (entry.limit <= 0) return entry.exceeded || entry.used > 0 ? 1 : 0;
  return Math.max(0, Math.min(entry.used / entry.limit, 1));
}

export function usageStatus(entry: QuotaEntry): string | null {
  if (!entry.exceeded) return entry.warning ? 'Approaching limit' : null;
  const date = entry.resets_at ? new Date(entry.resets_at) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Limit reached';
  const reset = new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(date);
  return `Limit reached · resets ${reset}`;
}
