import React, { Suspense, lazy } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import AddFromLibraryModal from '../../components/AddFromLibraryModal';
import IdentifyAgainModal from '../../components/IdentifyAgainModal';
import { Toaster } from '../../components/ui/sonner';
import AppConfirmationLayer from './AppConfirmationLayer';
import AppViewport from './AppViewport';
import LoginModal from './LoginModal';
import UserSettingsModal from './UserSettingsModal';

const UnsortedClassificationModal = lazy(() => import('../../components/UnsortedClassificationModal'));

type AppShellProps = {
  googleClientId: string;
  sessionCaptureActive: boolean;
  unsortedClassificationModal: React.ComponentProps<typeof UnsortedClassificationModal>;
  libraryModal: React.ComponentProps<typeof AddFromLibraryModal>;
  loginModal: React.ComponentProps<typeof LoginModal>;
  settingsModal: React.ComponentProps<typeof UserSettingsModal>;
  sidebar: React.ReactNode;
  viewport: React.ComponentProps<typeof AppViewport>;
  identifyAgainModal: React.ComponentProps<typeof IdentifyAgainModal>;
  confirmationLayer: React.ComponentProps<typeof AppConfirmationLayer>;
};

export default function AppShell({
  googleClientId,
  sessionCaptureActive,
  unsortedClassificationModal,
  libraryModal,
  loginModal,
  settingsModal,
  sidebar,
  viewport,
  identifyAgainModal,
  confirmationLayer,
}: AppShellProps) {
  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <div className="relative flex h-dvh w-screen flex-row overflow-hidden bg-[var(--color-bg-primary)] text-neutral-900">
        <Toaster />

        <Suspense fallback={null}>
          <UnsortedClassificationModal {...unsortedClassificationModal} />
        </Suspense>

        <AddFromLibraryModal {...libraryModal} />
        <LoginModal {...loginModal} />
        <UserSettingsModal {...settingsModal} />

        {!sessionCaptureActive && sidebar}

        <main className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          <AppViewport {...viewport} />
          <IdentifyAgainModal {...identifyAgainModal} />
          <AppConfirmationLayer {...confirmationLayer} />
        </main>
      </div>
    </GoogleOAuthProvider>
  );
}
