import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  MOBILE_API_BASE_URL,
  mobileApiClient,
  mobileAuthService,
  subscribeToMobileAuthenticationRequired,
} from '../api/runtime';
import { mobileQueryClient } from '../api/queryClient';
import { MobileAuthContractError } from './mobileAuthService';
import { fetchAuthenticatedUser } from './mobileAuthSession';
import type { MobileAuthSessionResponse, MobileAuthUser } from './mobileAuthTransport';

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
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retryRestore: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Unknown authentication error.');
}

export function AuthProvider({ children }: PropsWithChildren) {
  const loginInFlight = useRef(false);
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
    mobileQueryClient.clear();
    setRestoreError(null);
    setUser(null);
    setStatus('signedOut');
  }), []);

  const signIn = useCallback(async (authenticate: () => Promise<MobileAuthSessionResponse | null>) => {
    if (loginInFlight.current) return;
    loginInFlight.current = true;
    setRestoreError(null);
    setStatus('signingIn');
    try {
      const response = await authenticate();
      if (!response) {
        setStatus('signedOut');
        return;
      }
      if (!response.user) {
        await mobileAuthService.logout();
        throw new MobileAuthContractError();
      }
      mobileQueryClient.clear();
      setUser(response.user);
      setStatus('authenticated');
    } catch (error) {
      setUser(null);
      setStatus('signedOut');
      throw error;
    } finally {
      loginInFlight.current = false;
    }
  }, []);

  const loginWithEmail = useCallback((email: string, password: string) => (
    signIn(() => mobileAuthService.loginWithEmail(email, password))
  ), [signIn]);
  const loginWithGoogle = useCallback(() => (
    signIn(() => mobileAuthService.loginWithGoogle())
  ), [signIn]);

  const logout = useCallback(async () => {
    await mobileAuthService.logout();
    mobileQueryClient.clear();
    setRestoreError(null);
    setUser(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    restoreError,
    status,
    user,
    loginWithEmail,
    loginWithGoogle,
    logout,
    retryRestore: restore,
  }), [loginWithEmail, loginWithGoogle, logout, restore, restoreError, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }
  return context;
}
