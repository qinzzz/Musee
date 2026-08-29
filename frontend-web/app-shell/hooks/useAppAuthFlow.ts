import { useCallback, useEffect, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { AuthDiagnosticError } from '../../api/auth';
import { USER_ID_KEY } from '../../api/core';
import { transitionUserQueryCache } from '../../lib/queryClient';
import type { SessionAuthenticationRetry } from '../../session/hooks/useSessionMessaging';

const PENDING_AUTH_RETRY_KEY = 'musee_pending_auth_retry';

type AuthStatus = 'loading' | 'guest' | 'authenticated' | 'reauth_required';

type AuthenticatedUser = {
  user_id: string;
  is_new_user?: boolean;
};

type AuthFlowPlatform = {
  localStorage: Pick<Storage, 'setItem'>;
  sessionStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  reloadPage: () => void;
};

type UseAppAuthFlowOptions = {
  authStatus: AuthStatus;
  currentUser: { user_id: string } | null;
  sessionUserId: string;
  queryClient: QueryClient;
  completeLogin: (user: AuthenticatedUser) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  logoutCurrentSession: () => Promise<void>;
  retryAuthenticationRequiredResponse: (retry: SessionAuthenticationRetry) => Promise<unknown>;
  showToast: (message: string, type?: 'info' | 'success') => void;
  platform?: AuthFlowPlatform;
};

const browserAuthFlowPlatform: AuthFlowPlatform = {
  localStorage,
  sessionStorage,
  reloadPage: () => window.location.reload(),
};

const readPendingAuthenticationRetry = (
  platform: AuthFlowPlatform,
): SessionAuthenticationRetry | null => {
  try {
    const raw = platform.sessionStorage.getItem(PENDING_AUTH_RETRY_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SessionAuthenticationRetry>;
    if (
      typeof value.sessionId !== 'string'
      || typeof value.responseId !== 'string'
      || typeof value.message !== 'string'
    ) {
      platform.sessionStorage.removeItem(PENDING_AUTH_RETRY_KEY);
      return null;
    }
    return value as SessionAuthenticationRetry;
  } catch {
    platform.sessionStorage.removeItem(PENDING_AUTH_RETRY_KEY);
    return null;
  }
};

export function useAppAuthFlow({
  authStatus,
  currentUser,
  sessionUserId,
  queryClient,
  completeLogin,
  continueAsGuest,
  logoutCurrentSession,
  retryAuthenticationRequiredResponse,
  showToast,
  platform = browserAuthFlowPlatform,
}: UseAppAuthFlowOptions) {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pendingAuthenticationRetry, setPendingAuthenticationRetry] = useState<SessionAuthenticationRetry | null>(
    () => readPendingAuthenticationRetry(platform),
  );

  useEffect(() => {
    if (authStatus === 'reauth_required') {
      setShowLoginModal(true);
    }
  }, [authStatus]);

  useEffect(() => {
    if (authStatus === 'guest' && pendingAuthenticationRetry) {
      setShowLoginModal(true);
    }
  }, [authStatus, pendingAuthenticationRetry]);

  useEffect(() => {
    if (!currentUser || !pendingAuthenticationRetry) return;
    const retry = pendingAuthenticationRetry;
    platform.sessionStorage.removeItem(PENDING_AUTH_RETRY_KEY);
    setPendingAuthenticationRetry(null);
    void retryAuthenticationRequiredResponse(retry).catch((error) => {
      console.error('Failed to resume the guest action after sign-in:', error);
      showToast('Signed in, but couldn’t resume that message. Try sending it again.', 'info');
    });
  }, [
    currentUser,
    pendingAuthenticationRetry,
    platform,
    retryAuthenticationRequiredResponse,
    showToast,
  ]);

  const requestLogin = useCallback(() => {
    setShowLoginModal(true);
  }, []);

  const closeLogin = useCallback(() => {
    setShowLoginModal(false);
    if (authStatus === 'reauth_required') {
      void continueAsGuest();
    }
  }, [authStatus, continueAsGuest]);

  const handleLoginSuccess = useCallback(async (user: AuthenticatedUser) => {
    const previousUserId = sessionUserId;
    try {
      await completeLogin(user);
      await transitionUserQueryCache(queryClient, previousUserId, user.user_id);
      setShowLoginModal(false);
      showToast(user.is_new_user ? 'Welcome to Musee.' : 'Welcome back.', 'success');
    } catch (error) {
      console.error('Failed to complete sign-in:', error);
      setShowLoginModal(true);
      showToast(
        error instanceof AuthDiagnosticError
          ? error.message
          : 'Musee couldn’t verify your sign-in. Please try again.',
        'info',
      );
    }
  }, [completeLogin, queryClient, sessionUserId, showToast]);

  const handleLogout = useCallback(async () => {
    await logoutCurrentSession();
    queryClient.clear();
    platform.reloadPage();
  }, [logoutCurrentSession, platform, queryClient]);

  const handleSwitchDevProfile = useCallback(async (nextUserId: string) => {
    await logoutCurrentSession();
    platform.localStorage.setItem(USER_ID_KEY, nextUserId);
    platform.reloadPage();
  }, [logoutCurrentSession, platform]);

  const handleAuthenticationRequired = useCallback((retry: SessionAuthenticationRetry) => {
    platform.sessionStorage.setItem(PENDING_AUTH_RETRY_KEY, JSON.stringify(retry));
    setPendingAuthenticationRetry(retry);
    setShowLoginModal(true);
  }, [platform]);

  const loginModalOpen = showLoginModal && (
    !currentUser
    || authStatus === 'reauth_required'
    || Boolean(pendingAuthenticationRetry)
  );

  return {
    loginModalOpen,
    requestLogin,
    closeLogin,
    handleLoginSuccess,
    handleLogout,
    handleSwitchDevProfile,
    handleAuthenticationRequired,
  };
}
