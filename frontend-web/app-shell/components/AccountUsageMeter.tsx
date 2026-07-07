import React from 'react';
import type { QuotaEntry } from '../../api/account';
import { useAccountUsageQuery } from '../hooks/useAccountUsageQuery';

const QUOTA_LABELS: Record<string, string> = {
  artwork_uploads: 'Uploads today',
  stored_artworks: 'Artworks stored',
  tokens: 'AI usage this month',
};

function meterColor(entry: QuotaEntry): string {
  if (entry.exceeded) return 'bg-red-500';
  if (entry.warning) return 'bg-amber-500';
  return 'bg-neutral-800';
}

function formatResetNote(entry: QuotaEntry): string | null {
  if (!entry.exceeded || !entry.resets_at) return null;
  const resets = new Date(entry.resets_at);
  if (Number.isNaN(resets.getTime())) return null;
  return entry.period === 'day'
    ? 'Limit reached · resets tomorrow'
    : `Limit reached · resets ${resets.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

const UsageBar: React.FC<{ label: string; entry: QuotaEntry }> = ({ label, entry }) => {
  if (entry.limit === null) return null;
  const fraction = Math.min(entry.used / entry.limit, 1);
  const resetNote = formatResetNote(entry);
  return (
    <div data-testid={`usage-${label}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-neutral-400">{label}</span>
        <span className={`text-[10px] font-semibold ${entry.exceeded ? 'text-red-500' : entry.warning ? 'text-amber-600' : 'text-neutral-500'}`}>
          {entry.used}/{entry.limit}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
        <div
          className={`h-full rounded-full transition-all ${meterColor(entry)}`}
          style={{ width: `${Math.max(fraction * 100, entry.used > 0 ? 4 : 0)}%` }}
        />
      </div>
      {resetNote && (
        <p className="mt-1 text-[10px] font-medium text-red-500">{resetNote}</p>
      )}
    </div>
  );
};

// Rendered inside the user-menu dropdown; it remounts on each open, which
// triggers a fresh fetch through the query layer, so meters are always
// current when the user looks at them.
const AccountUsageMeter: React.FC<{ userId: string }> = ({ userId }) => {
  const { usage } = useAccountUsageQuery(userId);
  if (!usage) return null;

  const metered = Object.entries(usage.quotas)
    .filter(([, entry]) => entry.limit !== null && entry.on_exceed !== 'allow');

  if (metered.length === 0) {
    return (
      <div className="mb-4 rounded-xl bg-neutral-50 px-3 py-2">
        <span className="text-[10px] font-semibold text-neutral-500">Unlimited plan</span>
      </div>
    );
  }

  return (
    <div className="mb-4 space-y-3">
      {metered.map(([quota, entry]) => (
        <UsageBar key={quota} label={QUOTA_LABELS[quota] || quota} entry={entry} />
      ))}
    </div>
  );
};

export default AccountUsageMeter;
