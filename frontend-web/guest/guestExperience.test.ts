import { describe, expect, it } from 'vitest';
import { deriveGuestExperience } from './guestExperience';

const quotas = (sessions: number, messages: number) => ({
  guest_sessions: { limit: 1, used: 1 - sessions, remaining: sessions, period: 'workspace' },
  guest_messages: { limit: 1, used: 1 - messages, remaining: messages, period: 'workspace' },
});

describe('deriveGuestExperience', () => {
  it('allows one fresh preview session', () => {
    expect(deriveGuestExperience({
      quotas: quotas(1, 1),
      hasSession: false,
      hasUserMessage: false,
    })).toMatchObject({
      stage: 'fresh',
      canStartSession: true,
      canInteract: true,
    });
  });

  it('keeps the one existing empty session interactive', () => {
    expect(deriveGuestExperience({
      quotas: quotas(0, 1),
      hasSession: true,
      hasUserMessage: false,
    })).toMatchObject({
      stage: 'active',
      canStartSession: false,
      canInteract: true,
    });
  });

  it('uses local activity to close stale server quota windows immediately', () => {
    expect(deriveGuestExperience({
      quotas: quotas(1, 1),
      hasSession: true,
      hasUserMessage: true,
    })).toMatchObject({
      stage: 'exhausted',
      canStartSession: false,
      canInteract: false,
      interactionGate: { blocked: true },
    });
  });
});
