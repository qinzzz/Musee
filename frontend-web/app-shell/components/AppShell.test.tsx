import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AppShell from './AppShell';

vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../components/UnsortedClassificationModal', () => ({
  default: () => <div>classification-modal</div>,
}));

vi.mock('../../components/AddFromLibraryModal', () => ({
  default: () => <div>library-modal</div>,
}));

vi.mock('./LoginModal', () => ({
  default: () => <div>login-modal</div>,
}));

vi.mock('./UserSettingsModal', () => ({
  default: () => <div>settings-modal</div>,
}));

vi.mock('../../guest/GuestSidebar', () => ({
  default: () => <div>guest-sidebar</div>,
}));

vi.mock('./AppSidebar', () => ({
  default: () => <div>authenticated-sidebar</div>,
}));

vi.mock('./AppViewport', () => ({
  default: () => <div>viewport</div>,
}));

vi.mock('../../components/IdentifyAgainModal', () => ({
  default: () => <div>identify-modal</div>,
}));

vi.mock('./AppConfirmationLayer', () => ({
  default: () => <div>confirmation-layer</div>,
}));

vi.mock('../../components/ui/sonner', () => ({
  Toaster: () => <div>toaster</div>,
}));

function renderAppShell({
  sessionCaptureActive = false,
}: {
  sessionCaptureActive?: boolean;
} = {}) {
  render(
    <AppShell
      googleClientId="client-id"
      sessionCaptureActive={sessionCaptureActive}
      unsortedClassificationModal={{} as never}
      libraryModal={{} as never}
      loginModal={{} as never}
      settingsModal={{} as never}
      sidebar={<div>sidebar</div>}
      viewport={{} as never}
      identifyAgainModal={{} as never}
      confirmationLayer={{} as never}
    />,
  );
}

describe('AppShell', () => {
  it('renders the authenticated sidebar and top-level application layers', async () => {
    renderAppShell();

    expect(await screen.findByText('classification-modal')).toBeTruthy();
    expect(screen.getByText('sidebar')).toBeTruthy();
    expect(screen.getByText('viewport')).toBeTruthy();
    expect(screen.getByText('login-modal')).toBeTruthy();
    expect(screen.getByText('confirmation-layer')).toBeTruthy();
  });

  it('hides the sidebar while the capture surface is active', async () => {
    renderAppShell({ sessionCaptureActive: true });

    expect(await screen.findByText('classification-modal')).toBeTruthy();
    expect(screen.queryByText('sidebar')).toBeNull();
    expect(screen.getByText('viewport')).toBeTruthy();
  });
});
