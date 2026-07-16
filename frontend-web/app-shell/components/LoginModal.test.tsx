import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoginModal from './LoginModal';

const {
  mockLoginWithEmail,
  mockSignupWithEmail,
  mockRequestPasswordReset,
} = vi.hoisted(() => ({
  mockLoginWithEmail: vi.fn(),
  mockSignupWithEmail: vi.fn(),
  mockRequestPasswordReset: vi.fn(),
}));

vi.mock('../../api/auth', async () => {
  class EmailAuthError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    EmailAuthError,
    loginWithEmail: mockLoginWithEmail,
    signupWithEmail: mockSignupWithEmail,
    requestPasswordReset: mockRequestPasswordReset,
  };
});

vi.mock('../../components/GoogleLogin', () => ({
  default: () => <div>google-button</div>,
}));

function renderModal(onLoginSuccess = vi.fn()) {
  render(
    <LoginModal open onClose={vi.fn()} onLoginSuccess={onLoginSuccess} />,
  );
  return { onLoginSuccess };
}

function fillAndSubmit(email: string, password?: string) {
  fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: email } });
  if (password !== undefined) {
    fireEvent.change(screen.getByPlaceholderText(/Password/), { target: { value: password } });
  }
  fireEvent.click(screen.getByRole('button', { name: /Sign in|Sign up|Send reset link/ }));
}

describe('LoginModal', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('logs in with email and reports the user', async () => {
    mockLoginWithEmail.mockResolvedValue({ user: { user_id: 'u1' } });
    const { onLoginSuccess } = renderModal();

    fillAndSubmit('ada@example.com', 'correct-horse');

    await waitFor(() => {
      expect(mockLoginWithEmail).toHaveBeenCalledWith('ada@example.com', 'correct-horse');
      expect(onLoginSuccess).toHaveBeenCalledWith({ user_id: 'u1' });
    });
  });

  it('signup shows the check-your-inbox notice', async () => {
    mockSignupWithEmail.mockResolvedValue({ ok: true });
    renderModal();

    fireEvent.click(screen.getByText('Create an account'));
    fillAndSubmit('ada@example.com', 'correct-horse');

    await waitFor(() => {
      expect(screen.getByText(/check your inbox/i)).toBeTruthy();
    });
  });

  it('unverified login points back to the inbox instead of a raw error', async () => {
    const { EmailAuthError } = await import('../../api/auth');
    mockLoginWithEmail.mockRejectedValue(new EmailAuthError('email_unverified', 'not yet'));
    renderModal();

    fillAndSubmit('ada@example.com', 'correct-horse');

    await waitFor(() => {
      expect(screen.getByText(/not verified yet/i)).toBeTruthy();
    });
  });

  it('surfaces backend error messages', async () => {
    const { EmailAuthError } = await import('../../api/auth');
    mockSignupWithEmail.mockRejectedValue(
      new EmailAuthError('email_exists', 'An account with this email already exists. Sign in instead.'),
    );
    renderModal();

    fireEvent.click(screen.getByText('Create an account'));
    fillAndSubmit('ada@example.com', 'correct-horse');

    await waitFor(() => {
      expect(screen.getByText(/already exists/i)).toBeTruthy();
    });
  });

  it('wrong credentials show a specific message, not the generic fallback', async () => {
    const { EmailAuthError } = await import('../../api/auth');
    mockLoginWithEmail.mockRejectedValue(new EmailAuthError('invalid_credentials', 'Something went wrong. Please try again.'));
    renderModal();

    fillAndSubmit('ada@example.com', 'wrong-password');

    await waitFor(() => {
      expect(screen.getByText('Incorrect email or password.')).toBeTruthy();
    });
  });

  it('forgot-password flow requests a reset and stays silent about existence', async () => {
    mockRequestPasswordReset.mockResolvedValue(undefined);
    renderModal();

    fireEvent.click(screen.getByText('Forgot password?'));
    fillAndSubmit('ghost@example.com');

    await waitFor(() => {
      expect(mockRequestPasswordReset).toHaveBeenCalledWith('ghost@example.com');
      expect(screen.getByText(/If an account exists/i)).toBeTruthy();
    });
  });
});
