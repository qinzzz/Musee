import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ resetPassword: vi.fn() }));
vi.mock('../../api/auth', () => ({
  resetPassword: mocks.resetPassword,
  verifyEmailToken: vi.fn(), rememberPostAuthWelcome: vi.fn(),
  EmailAuthError: class extends Error { constructor(public code: string, message: string) { super(message); } },
}));
import { ResetPasswordPage } from './EmailAuthPages';
import { EmailAuthError } from '../../api/auth';
afterEach(() => { vi.resetAllMocks(); window.history.replaceState({}, '', '/'); });

function fill(password: string, confirmation: string) {
  fireEvent.change(screen.getByPlaceholderText('New password (8+ characters)'), { target: { value: password } });
  fireEvent.change(screen.getByPlaceholderText('Confirm new password'), { target: { value: confirmation } });
  fireEvent.click(screen.getByRole('button', { name: 'Set password & sign in' }));
}

it('blocks mismatched passwords without consuming the email token', () => {
  render(<ResetPasswordPage />);
  fill('new-password', 'different-password');
  expect(screen.getByText('Passwords do not match.')).toBeTruthy();
  expect(mocks.resetPassword).not.toHaveBeenCalled();
});

it('submits the emailed token and shows expired-link errors with an enabled retry', async () => {
  window.history.replaceState({}, '', '/reset-password?token=expired-token');
  mocks.resetPassword.mockRejectedValue(new EmailAuthError('invalid_token', 'This link is invalid or has expired. Request a new one.'));
  render(<ResetPasswordPage />);
  fill('new-password', 'new-password');
  await waitFor(() => expect(screen.getByText(/This link is invalid/)).toBeTruthy());
  expect(mocks.resetPassword).toHaveBeenCalledWith('expired-token', 'new-password');
  expect((screen.getByRole('button', { name: 'Set password & sign in' }) as HTMLButtonElement).disabled).toBe(false);
});
