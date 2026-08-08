import React from 'react';
import {
  getSessionProcessingLabel,
  type SessionProcessingState,
} from '../lib/sessionProcessingState';

type SessionProcessingIndicatorProps = {
  state: SessionProcessingState;
};

export default function SessionProcessingIndicator({ state }: SessionProcessingIndicatorProps) {
  const label = getSessionProcessingLabel(state);
  if (!label) return null;

  const isActive = state.kind !== 'failed';
  return (
    <div
      className="flex items-center gap-2 py-1 text-[14px] leading-6 text-neutral-500"
      role="status"
      aria-live="polite"
    >
      {isActive ? (
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-neutral-400" aria-hidden="true" />
      ) : null}
      <span>{label}</span>
    </div>
  );
}
