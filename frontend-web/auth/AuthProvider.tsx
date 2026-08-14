import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { bootstrapAuthSession, logout as logoutApi } from '../api/auth';
import { REAUTH_REQUIRED_EVENT } from '../api/core';

type AuthStatus = 'loading' | 'guest' | 'authenticated' | 'reauth_required';

type AuthContextValue = {
  status: AuthStatus;
  currentUser: any | null;
  capabilities: Record<string, boolean>;
  completeLogin: (user: any) => void;
  continueAsGuest: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [capabilities, setCapabilities] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    void bootstrapAuthSession()
      .then((snapshot) => {
        if (!active) return;
        setCurrentUser(snapshot.principal);
        setCapabilities(snapshot.capabilities);
        setStatus(snapshot.state);
      })
      .catch(() => {
        if (!active) return;
        setCurrentUser(null);
        setCapabilities({});
        setStatus('guest');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleReauthRequired = () => setStatus((previous) => (
      previous === 'authenticated' ? 'reauth_required' : previous
    ));
    window.addEventListener(REAUTH_REQUIRED_EVENT, handleReauthRequired);
    return () => window.removeEventListener(REAUTH_REQUIRED_EVENT, handleReauthRequired);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    currentUser,
    capabilities,
    completeLogin: (user) => {
      setCurrentUser(user);
      setStatus('authenticated');
    },
    continueAsGuest: () => {
      setCurrentUser(null);
      setCapabilities({});
      setStatus('guest');
    },
    logout: async () => {
      await logoutApi();
      setCurrentUser(null);
      setCapabilities({});
      setStatus('guest');
    },
  }), [capabilities, currentUser, status]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-primary)] text-sm text-neutral-400">
        Loading…
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
