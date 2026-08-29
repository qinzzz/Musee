import React from 'react';
import { DEV_FIXED_USER_ID, DEV_FREE_TIER_USER_ID } from '../../api/core';

const DEV_PROFILE_OPTIONS = [
  { id: DEV_FIXED_USER_ID, label: 'Unlimited' },
  { id: DEV_FREE_TIER_USER_ID, label: 'Free' },
];

type Props = {
  currentUserId: string;
  onSwitchProfile: (userId: string) => Promise<void>;
};

export default function DevProfileSwitcher({ currentUserId, onSwitchProfile }: Props) {
  return (
    <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700">Dev profile</p>
        <p className="mt-0.5 truncate text-[11px] text-amber-900/70">{currentUserId}</p>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {DEV_PROFILE_OPTIONS.map((profile) => {
          const isActive = currentUserId === profile.id;
          return (
            <button
              key={profile.id}
              type="button"
              onClick={() => {
                if (isActive) return;
                void onSwitchProfile(profile.id);
              }}
              className={`rounded-xl px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                isActive
                  ? 'bg-amber-900 text-white shadow-sm'
                  : 'bg-white text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100'
              }`}
            >
              {profile.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
