import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import GoogleLogin from './GoogleLogin';

vi.mock('@react-oauth/google', () => ({
  GoogleLogin: ({ onError }: { onError: () => void }) => (
    <button type="button" onClick={onError}>Google provider error</button>
  ),
}));

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
});
