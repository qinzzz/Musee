import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import GoogleLogin, { shouldUseMobileGoogleRedirect } from './GoogleLogin';

vi.mock('@react-oauth/google', () => ({
  GoogleLogin: ({
    onError,
    ux_mode,
    login_uri,
    useOneTap,
  }: {
    onError: () => void;
    ux_mode?: string;
    login_uri?: string;
    useOneTap?: boolean;
  }) => (
    <button
      type="button"
      onClick={onError}
      data-ux-mode={ux_mode}
      data-login-uri={login_uri}
      data-use-one-tap={String(useOneTap)}
    >
      Google provider error
    </button>
  ),
}));

const originalUserAgent = navigator.userAgent;

function setUserAgent(userAgent: string): void {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  });
}

afterEach(() => {
  setUserAgent(originalUserAgent);
});

describe('GoogleLogin', () => {
  it('classifies a provider cancellation or interruption', () => {
    const onLoginError = vi.fn();
    render(
      <GoogleLogin
        onLoginSuccess={vi.fn()}
        onLoginError={onLoginError}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Google provider error' }));

    expect(onLoginError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'google_interrupted',
      message: 'Google sign-in was interrupted.',
    }));
  });

  it('keeps popup mode and One Tap on desktop browsers', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/150 Safari/537.36');

    render(<GoogleLogin onLoginSuccess={vi.fn()} onLoginError={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Google provider error' });
    expect(button.getAttribute('data-ux-mode')).toBe('popup');
    expect(button.getAttribute('data-use-one-tap')).toBe('true');
    expect(button.getAttribute('data-login-uri')).toBeNull();
  });

  it('uses the server redirect flow without One Tap on mobile browsers', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1');

    render(<GoogleLogin onLoginSuccess={vi.fn()} onLoginError={vi.fn()} />);

    const button = screen.getByRole('button', { name: 'Google provider error' });
    expect(button.getAttribute('data-ux-mode')).toBe('redirect');
    expect(button.getAttribute('data-use-one-tap')).toBe('false');
    expect(button.getAttribute('data-login-uri')).toMatch(/\/api\/auth\/google\/redirect$/);
  });

  it('recognizes iPadOS devices that identify as a Mac', () => {
    expect(shouldUseMobileGoogleRedirect(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'MacIntel',
      5,
    )).toBe(true);
  });
});
