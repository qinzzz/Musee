import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { REAUTH_REQUIRED_EVENT } from '../api/core';
import { AuthProvider, useAuth } from './AuthProvider';

const bootstrapAuthSession = vi.fn();
const logoutApi = vi.fn();

vi.mock('../api/auth', () => ({
  bootstrapAuthSession: (...args: unknown[]) => bootstrapAuthSession(...args),
  logout: (...args: unknown[]) => logoutApi(...args),
}));

function AuthProbe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="user">{auth.currentUser?.user_id || 'none'}</span>
      <button onClick={auth.continueAsGuest}>Continue as guest</button>
    </div>
  );
}

describe('AuthProvider', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('bootstraps identity and exposes explicit reauthentication and guest states', async () => {
    let finishBootstrap!: (snapshot: unknown) => void;
    bootstrapAuthSession.mockReturnValue(new Promise((resolve) => {
      finishBootstrap = resolve;
    }));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    expect(screen.getByText('Loading…')).toBeTruthy();

    await act(async () => {
      finishBootstrap({
        state: 'authenticated',
        principal: { user_id: 'u1' },
        capabilities: {},
        quotas: {},
        plan: 'unlimited',
      });
    });
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('user').textContent).toBe('u1');

    act(() => window.dispatchEvent(new CustomEvent(REAUTH_REQUIRED_EVENT)));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('reauth_required'));

    fireEvent.click(screen.getByRole('button', { name: 'Continue as guest' }));
    expect(screen.getByTestId('status').textContent).toBe('guest');
    expect(screen.getByTestId('user').textContent).toBe('none');
  });

  it('falls back to guest when bootstrap cannot reach the server', async () => {
    bootstrapAuthSession.mockRejectedValue(new Error('offline'));

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('guest'));
  });
});
