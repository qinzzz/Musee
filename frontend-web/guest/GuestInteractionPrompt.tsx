import React from 'react';
import type { GuestInteractionGate } from './guestExperience';

type GuestInteractionPromptProps = {
  gate: GuestInteractionGate;
  onSignIn: () => void;
  compact?: boolean;
};

export default function GuestInteractionPrompt({
  gate,
  onSignIn,
  compact = false,
}: GuestInteractionPromptProps) {
  if (!gate.blocked) return null;

  return (
    <div
      data-testid="guest-interaction-prompt"
      className={`border border-neutral-200 bg-white text-center shadow-sm ${
        compact ? 'rounded-[26px] px-5 py-4' : 'rounded-[24px] px-6 py-5'
      }`}
    >
      <p className="text-[15px] font-semibold text-neutral-900">{gate.title}</p>
      <p className="mt-1 text-[13px] leading-5 text-neutral-500">{gate.message}</p>
      <button
        type="button"
        onClick={onSignIn}
        className="mt-3 rounded-full bg-neutral-900 px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-neutral-800"
      >
        {gate.actionLabel}
      </button>
    </div>
  );
}
