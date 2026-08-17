import { describe, expect, it } from 'vitest';
import { deriveGuestExperience } from './guestExperience';

const quotas = (sessions: number, messages: number, artworks = 1) => ({
  guest_sessions: { limit: 1, used: 1 - sessions, remaining: sessions, period: 'workspace' },
  guest_messages: { limit: 3, used: 3 - messages, remaining: messages, period: 'workspace' },
  guest_artworks: { limit: 1, used: 1 - artworks, remaining: artworks, period: 'workspace' },
});

describe('deriveGuestExperience', () => {
  it('allows one fresh preview session', () => {
    expect(deriveGuestExperience({
      quotas: quotas(1, 3),
      hasSession: false,
      userMessageCount: 0,
      hasArtwork: false,
    })).toMatchObject({
      stage: 'fresh',
      canStartSession: true,
      canInteract: true,
      canUploadArtwork: true,
    });
  });

  it('keeps the one existing empty session interactive', () => {
    expect(deriveGuestExperience({
      quotas: quotas(0, 3),
      hasSession: true,
      userMessageCount: 0,
      hasArtwork: false,
    })).toMatchObject({
      stage: 'active',
      canStartSession: false,
      canInteract: true,
    });
  });

  it('leaves two follow-ups after the artwork turn', () => {
    expect(deriveGuestExperience({
      quotas: quotas(0, 3),
      hasSession: true,
      userMessageCount: 1,
      hasArtwork: true,
    })).toMatchObject({
      stage: 'active',
      canStartSession: false,
      canInteract: true,
      canUploadArtwork: false,
      messageRemaining: 2,
      artworkRemaining: 0,
    });
  });

  it('uses local activity to close stale server quota windows after three turns', () => {
    expect(deriveGuestExperience({
      quotas: quotas(1, 3),
      hasSession: true,
      userMessageCount: 3,
      hasArtwork: true,
    })).toMatchObject({
      stage: 'exhausted',
      canStartSession: false,
      canInteract: false,
      interactionGate: { blocked: true },
    });
  });
});
