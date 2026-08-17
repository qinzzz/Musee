export const GUEST_SESSION_QUOTA = 'guest_sessions';
export const GUEST_MESSAGE_QUOTA = 'guest_messages';

type GuestQuota = {
  limit?: number;
  used?: number;
  remaining?: number;
  period?: string;
};

export type GuestQuotas = Record<string, unknown>;

export type GuestExperienceStage = 'fresh' | 'active' | 'exhausted';

export type GuestInteractionGate = {
  blocked: boolean;
  title: string;
  message: string;
  actionLabel: string;
};

export type GuestExperience = {
  stage: GuestExperienceStage;
  canStartSession: boolean;
  canInteract: boolean;
  sessionRemaining: number;
  messageRemaining: number;
  sidebarTitle: string;
  sidebarMessage: string;
  signInLabel: string;
  interactionGate: GuestInteractionGate;
};

export const GUEST_EXPERIENCE_COPY = {
  fresh: {
    title: 'Your guest preview',
    message: 'Start one session and ask one question to try Musee.',
  },
  active: {
    title: 'Your preview session',
    message: 'This is your one guest session. Sign in whenever you want to keep exploring.',
  },
  exhausted: {
    title: 'Your preview is complete',
    message: 'Sign in to keep this conversation and continue exploring.',
  },
  interaction: {
    title: 'Keep exploring with an account',
    message: 'You’ve used your guest preview. Sign in to continue this conversation.',
    actionLabel: 'Sign in to continue',
  },
} as const;

function quotaRemaining(quotas: GuestQuotas, key: string): number {
  const quota = quotas[key];
  if (!quota || typeof quota !== 'object') return 0;
  const value = (quota as GuestQuota).remaining;
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(value, 0) : 0;
}

export function deriveGuestExperience({
  quotas,
  hasSession,
  hasUserMessage,
}: {
  quotas: GuestQuotas;
  hasSession: boolean;
  hasUserMessage: boolean;
}): GuestExperience {
  const serverSessionRemaining = quotaRemaining(quotas, GUEST_SESSION_QUOTA);
  const serverMessageRemaining = quotaRemaining(quotas, GUEST_MESSAGE_QUOTA);
  const sessionRemaining = hasSession ? 0 : serverSessionRemaining;
  const messageRemaining = hasUserMessage ? 0 : serverMessageRemaining;
  const canStartSession = !hasSession && sessionRemaining > 0 && messageRemaining > 0;
  const canInteract = messageRemaining > 0 && (hasSession || sessionRemaining > 0);
  const stage: GuestExperienceStage = !canInteract
    ? 'exhausted'
    : hasSession
      ? 'active'
      : 'fresh';
  const sidebarCopy = GUEST_EXPERIENCE_COPY[stage];

  return {
    stage,
    canStartSession,
    canInteract,
    sessionRemaining,
    messageRemaining,
    sidebarTitle: sidebarCopy.title,
    sidebarMessage: sidebarCopy.message,
    signInLabel: stage === 'exhausted' ? 'Sign in to continue' : 'Sign in',
    interactionGate: {
      blocked: !canInteract,
      ...GUEST_EXPERIENCE_COPY.interaction,
    },
  };
}
