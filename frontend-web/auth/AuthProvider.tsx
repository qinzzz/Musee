import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { bootstrapAuthSession, logout as logoutApi } from '../api/auth';
import { REAUTH_REQUIRED_EVENT } from '../api/core';

type AuthStatus = 'loading' | 'guest' | 'authenticated' | 'reauth_required';

type AuthContextValue = {
  status: AuthStatus;
  currentUser: any | null;
  guestUserId: string | null;
  capabilities: Record<string, boolean>;
  quotas: Record<string, unknown>;
  completeLogin: (user: any) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [guestUserId, setGuestUserId] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<Record<string, boolean>>({});
  const [quotas, setQuotas] = useState<Record<string, unknown>>({});

  const applySnapshot = (snapshot: Awaited<ReturnType<typeof bootstrapAuthSession>>) => {
    setCurrentUser(snapshot.state === 'authenticated' ? snapshot.principal : null);
    setGuestUserId(snapshot.state === 'guest' ? snapshot.principal?.user_id || null : null);
    setCapabilities(snapshot.capabilities);
    setQuotas(snapshot.quotas);
    setStatus(snapshot.state);
  };

  useEffect(() => {
    let active = true;
    void bootstrapAuthSession()
      .then((snapshot) => {
        if (!active) return;
        applySnapshot(snapshot);
      })
      .catch(() => {
        if (!active) return;
        setCurrentUser(null);
        setGuestUserId(null);
        setCapabilities({});
        setQuotas({});
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
    guestUserId,
    capabilities,
    quotas,
    completeLogin: async (user) => {
      setCurrentUser(user);
      const snapshot = await bootstrapAuthSession();
      applySnapshot(snapshot);
    },
    continueAsGuest: async () => {
      const snapshot = await bootstrapAuthSession();
      applySnapshot(snapshot);
    },
    logout: async () => {
      await logoutApi();
      const snapshot = await bootstrapAuthSession();
      applySnapshot(snapshot);
    },
  }), [capabilities, currentUser, guestUserId, quotas, status]);

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
