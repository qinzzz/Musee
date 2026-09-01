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
} from '../api/runtime';
import { fetchAuthenticatedUser } from './mobileAuthSession';
import type { MobileAuthUser } from './mobileAuthTransport';

export type AuthStatus =
  | 'restoring'
  | 'signedOut'
  | 'signingIn'
  | 'authenticated'
  | 'error';

type AuthContextValue = {
  status: AuthStatus;
  user: MobileAuthUser | null;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retryRestore: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [user, setUser] = useState<MobileAuthUser | null>(null);

  const restore = useCallback(async () => {
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
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void restore();
  }, [restore]);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    setStatus('signingIn');
    try {
      const response = await mobileAuthService.loginWithEmail(email, password);
      if (!response.user) {
        await mobileAuthService.logout();
        throw new Error('The login response did not include a user.');
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
    setUser(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    user,
    loginWithEmail,
    logout,
    retryRestore: restore,
  }), [loginWithEmail, logout, restore, status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }
  return context;
}
