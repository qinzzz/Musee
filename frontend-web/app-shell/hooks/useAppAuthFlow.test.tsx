import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { USER_ID_KEY } from '../../api/core';
import type { SessionAuthenticationRetry } from '../../session/hooks/useSessionMessaging';
import { useAppAuthFlow } from './useAppAuthFlow';

const { transitionUserQueryCache } = vi.hoisted(() => ({
  transitionUserQueryCache: vi.fn(),
}));

vi.mock('../../lib/queryClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/queryClient')>();
  return {
    ...actual,
    transitionUserQueryCache,
  };
});

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
}

function createHarness(overrides: Partial<Parameters<typeof useAppAuthFlow>[0]> = {}) {
  const localStorage = createStorage();
  const sessionStorage = createStorage();
  const reloadPage = vi.fn();
  const queryClient = new QueryClient();
  const options: Parameters<typeof useAppAuthFlow>[0] = {
    authStatus: 'guest',
    currentUser: null,
    sessionUserId: 'guest-1',
    queryClient,
    completeLogin: vi.fn().mockResolvedValue(undefined),
    continueAsGuest: vi.fn().mockResolvedValue(undefined),
    logoutCurrentSession: vi.fn().mockResolvedValue(undefined),
    retryAuthenticationRequiredResponse: vi.fn().mockResolvedValue(undefined),
    showToast: vi.fn(),
    platform: { localStorage, sessionStorage, reloadPage },
    ...overrides,
  };

  return { localStorage, sessionStorage, reloadPage, queryClient, options };
}

describe('useAppAuthFlow', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('opens for reauthentication and continues as guest when dismissed', async () => {
    const harness = createHarness({ authStatus: 'reauth_required', currentUser: { user_id: 'u1' } });
    const { result } = renderHook(() => useAppAuthFlow(harness.options));

    await waitFor(() => expect(result.current.loginModalOpen).toBe(true));

    act(() => result.current.closeLogin());

    expect(harness.options.continueAsGuest).toHaveBeenCalledTimes(1);
    expect(result.current.loginModalOpen).toBe(false);
  });

  it('verifies login, transitions the user cache, and closes the modal', async () => {
    const harness = createHarness();
    const { result } = renderHook(() => useAppAuthFlow(harness.options));

    act(() => result.current.requestLogin());
    expect(result.current.loginModalOpen).toBe(true);

    await act(async () => {
      await result.current.handleLoginSuccess({ user_id: 'u1', is_new_user: true });
    });

    expect(harness.options.completeLogin).toHaveBeenCalledWith({ user_id: 'u1', is_new_user: true });
    expect(transitionUserQueryCache).toHaveBeenCalledWith(harness.queryClient, 'guest-1', 'u1');
    expect(harness.options.showToast).toHaveBeenCalledWith('Welcome to Musee.', 'success');
    expect(result.current.loginModalOpen).toBe(false);
  });

  it('persists an authentication retry and resumes it after login', async () => {
    const harness = createHarness();
    let currentUser: { user_id: string } | null = null;
    const retry: SessionAuthenticationRetry = {
      sessionId: 'session-1',
      responseId: 'response-1',
      message: 'Continue',
    };
    const { result, rerender } = renderHook(() => useAppAuthFlow({
      ...harness.options,
      currentUser,
    }));

    act(() => result.current.handleAuthenticationRequired(retry));

    expect(harness.sessionStorage.setItem).toHaveBeenCalledWith(
      'musee_pending_auth_retry',
      JSON.stringify(retry),
    );
    expect(result.current.loginModalOpen).toBe(true);

    currentUser = { user_id: 'u1' };
    rerender();

    await waitFor(() => {
      expect(harness.options.retryAuthenticationRequiredResponse).toHaveBeenCalledWith(retry);
    });
    expect(harness.sessionStorage.removeItem).toHaveBeenCalledWith('musee_pending_auth_retry');
  });

  it('clears query state on logout and switches the dev profile through the platform adapter', async () => {
    const harness = createHarness();
    const clear = vi.spyOn(harness.queryClient, 'clear');
    const { result } = renderHook(() => useAppAuthFlow(harness.options));

    await act(async () => {
      await result.current.handleLogout();
    });

    expect(harness.options.logoutCurrentSession).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(harness.reloadPage).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.handleSwitchDevProfile('musee-dev-user-freetier');
    });

    expect(harness.localStorage.setItem).toHaveBeenCalledWith(USER_ID_KEY, 'musee-dev-user-freetier');
    expect(harness.reloadPage).toHaveBeenCalledTimes(2);
  });
});
