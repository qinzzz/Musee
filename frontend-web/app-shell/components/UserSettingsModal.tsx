import React from 'react';
import type { UserQuota } from '../../api/auth';

type Props = {
  open: boolean;
  mode: 'account' | 'personalization' | null;
  currentUser: any;
  quotaInfo: UserQuota | null;
  language: string;
  onClose: () => void;
  onLanguageChange: (language: string) => void;
  onLogout: () => void;
};

const UserSettingsModal: React.FC<Props> = ({
  open,
  mode,
  currentUser,
  quotaInfo,
  language,
  onClose,
  onLanguageChange,
  onLogout,
}) => {
  if (!open || !mode) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h2 className="text-[15px] font-semibold text-neutral-900">
            {mode === 'account' ? 'Account settings' : 'Personalization'}
          </h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-base text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          >
            ✕
          </button>
        </div>

        {mode === 'account' ? (
          <div className="flex flex-col gap-5 px-5 py-5">
            <div>
              <label className="text-[11px] font-medium text-neutral-400">Display name</label>
              <div className="mt-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] text-neutral-900">
                {currentUser?.full_name || '—'}
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-neutral-400">Username</label>
              <div className="mt-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] text-neutral-900">
                {currentUser?.full_name?.toLowerCase().replace(/\s+/g, '') || '—'}
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-neutral-400">Email</label>
              <div className="mt-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] text-neutral-500">
                {currentUser?.email || '—'}
              </div>
            </div>
            <div className="border-t border-neutral-100 pt-4">
              <label className="text-[11px] font-medium text-neutral-400">Plan</label>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[13px] capitalize text-neutral-700">{quotaInfo?.tier ?? 'free'}</span>
                <span className="text-[11px] text-neutral-400">
                  {quotaInfo
                    ? quotaInfo.limit === null
                      ? `${quotaInfo.used} artworks (unlimited)`
                      : `${quotaInfo.used} / ${quotaInfo.limit} artworks`
                    : '…'}
                </span>
              </div>
              {quotaInfo && quotaInfo.limit !== null && (
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (quotaInfo.used / quotaInfo.limit) * 100)}%`,
                      backgroundColor:
                        quotaInfo.used >= quotaInfo.limit
                          ? '#ef4444'
                          : quotaInfo.used / quotaInfo.limit > 0.8
                            ? '#f59e0b'
                            : '#a3a3a3',
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5 px-5 py-5">
            <div>
              <label className="text-[11px] font-medium text-neutral-400">Gallery theme</label>
              <select className="mt-1.5 w-full appearance-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] text-neutral-600 outline-none">
                <option value="">Minimal (default)</option>
                <option value="warm">Warm</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-neutral-400">Card density</label>
              <select className="mt-1.5 w-full appearance-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] text-neutral-600 outline-none">
                <option value="">Comfortable (default)</option>
                <option value="compact">Compact</option>
                <option value="spacious">Spacious</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-neutral-400">Analysis language</label>
              <select
                value={language}
                onChange={(event) => onLanguageChange(event.target.value)}
                className="mt-1.5 w-full appearance-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] text-neutral-600 outline-none"
              >
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </div>
            {currentUser && (
              <button
                onClick={onLogout}
                className="rounded-xl border border-neutral-200 px-3 py-2.5 text-left text-[14px] text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                Sign out
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserSettingsModal;
