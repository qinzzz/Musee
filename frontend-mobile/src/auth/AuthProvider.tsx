import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  MOBILE_API_BASE_URL,
  mobileApiClient,
  mobileAuthService,
  subscribeToMobileAuthenticationRequired,
} from '../api/runtime';
import { MobileAuthContractError } from './mobileAuthService';
import { fetchAuthenticatedUser } from './mobileAuthSession';
import type { MobileAuthUser } from './mobileAuthTransport';

export type AuthStatus =
  | 'restoring'
  | 'signedOut'
  | 'signingIn'
  | 'authenticated'
  | 'error';

type AuthContextValue = {
  restoreError: Error | null;
  status: AuthStatus;
  user: MobileAuthUser | null;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retryRestore: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Unknown authentication error.');
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [restoreError, setRestoreError] = useState<Error | null>(null);
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [user, setUser] = useState<MobileAuthUser | null>(null);

  const restore = useCallback(async () => {
    setRestoreError(null);
    setStatus('restoring');
    setUser(null);
    try {
      const restored = await mobileAuthService.restoreSession();
      if (!restored) {
        setStatus('signedOut');
        return;
      }
      const restoredUser = await fetchAuthenticatedUser(
        mobileApiClient,
        MOBILE_API_BASE_URL,
      );
      setUser(restoredUser);
      setStatus('authenticated');
    } catch (error) {
      setRestoreError(normalizeError(error));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => subscribeToMobileAuthenticationRequired(() => {
    setRestoreError(null);
    setUser(null);
    setStatus('signedOut');
  }), []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    setStatus('signingIn');
    try {
      const response = await mobileAuthService.loginWithEmail(email, password);
      if (!response.user) {
        await mobileAuthService.logout();
        throw new MobileAuthContractError();
      }
      setUser(response.user);
      setStatus('authenticated');
    } catch (error) {
      setUser(null);
      setStatus('signedOut');
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    await mobileAuthService.logout();
    setRestoreError(null);
    setUser(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    restoreError,
    status,
    user,
    loginWithEmail,
    logout,
    retryRestore: restore,
  }), [loginWithEmail, logout, restore, restoreError, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }
  return context;
}
