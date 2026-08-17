import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GuestSidebar from './GuestSidebar';
import { deriveGuestExperience } from './guestExperience';

const experience = deriveGuestExperience({
  quotas: {
    guest_sessions: { remaining: 0 },
    guest_messages: { limit: 3, remaining: 0 },
    guest_artworks: { limit: 1, remaining: 0 },
  },
  hasSession: true,
  userMessageCount: 3,
  hasArtwork: true,
});

describe('GuestSidebar', () => {
  it('shows only the preview session and sign-in path', () => {
    const onSelectCurrentSession = vi.fn();
    const onSignIn = vi.fn();
    render(
      <GuestSidebar
        sidebarOpen
        sidebarCollapsed={false}
        experience={experience}
        currentSession={{
          id: 'session-1',
          title: 'My preview',
          location: null,
          artworkCount: 0,
          updatedAt: Date.now(),
          dateLabel: null,
          items: [],
        }}
        sessionsLoading={false}
        onSelectCurrentSession={onSelectCurrentSession}
        onSignIn={onSignIn}
        onExpandSidebar={vi.fn()}
        onCollapseSidebar={vi.fn()}
        onCloseMobileSidebar={vi.fn()}
      />,
    );

    expect(screen.getByText('My preview')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Search sessions')).toBeNull();
    expect(screen.queryByText('New Session')).toBeNull();
    expect(screen.queryByText('Collection')).toBeNull();
    expect(screen.queryByText('Profile')).toBeNull();

    fireEvent.click(screen.getByText('My preview'));
    expect(onSelectCurrentSession).toHaveBeenCalledWith('session-1');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to continue' }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });
});
