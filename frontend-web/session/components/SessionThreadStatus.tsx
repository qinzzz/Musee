import React from 'react';

export type SessionThreadStatusTone = 'active' | 'failed';

type SessionThreadStatusProps = {
  message: string;
  tone: SessionThreadStatusTone;
};

export default function SessionThreadStatus({ message, tone }: SessionThreadStatusProps) {
  return (
    <div
      className="flex items-center gap-2 py-1 text-[14px] leading-6 text-neutral-500"
      role="status"
      aria-live="polite"
    >
      {tone === 'active' ? (
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-neutral-400" aria-hidden="true" />
      ) : (
        <svg
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-red-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
      )}
      <span>{message}</span>
    </div>
  );
}
