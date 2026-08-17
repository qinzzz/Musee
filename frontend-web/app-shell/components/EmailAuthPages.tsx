import React, { useEffect, useState } from 'react';
import {
  EmailAuthError,
  rememberPostAuthWelcome,
  resetPassword,
  verifyEmailToken,
} from '../../api/auth';

// Standalone pages for the emailed links (/verify-email, /reset-password).
// Rendered instead of the app shell (see index.tsx), so clicking a link in a
// fresh browser doesn't boot the entire workspace just to redeem a token.
// On success the session is stored and we hard-navigate home, which is the
// same "reload into the signed-in app" path the login modal uses.

const cardClass =
  'w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl';
const primaryButtonClass =
  'w-full rounded-xl bg-neutral-900 px-3 py-2 text-[13px] font-semibold text-white transition-opacity ' +
  'hover:opacity-90 disabled:opacity-50';
const inputClass =
  'w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-base text-neutral-900 ' +
  'placeholder:text-neutral-400 outline-none transition-colors focus:border-neutral-400';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
      <div className={cardClass}>{children}</div>
    </div>
  );
}

function tokenFromLocation(): string {
  return new URLSearchParams(window.location.search).get('token') || '';
}

function goHome() {
  window.location.replace('/');
}

export const VerifyEmailPage: React.FC = () => {
  const [state, setState] = useState<'working' | 'error'>('working');
  const [message, setMessage] = useState('');

  useEffect(() => {
    verifyEmailToken(tokenFromLocation())
      .then((data) => {
        rememberPostAuthWelcome(Boolean(data.is_new_user));
        goHome();
      })
      .catch((err) => {
        setMessage(err instanceof EmailAuthError ? err.message : 'Something went wrong. Please try again.');
        setState('error');
      });
  }, []);

  return (
    <Shell>
      <h3 className="mb-2 text-lg font-bold text-neutral-900">
        {state === 'working' ? 'Verifying your email…' : 'Verification failed'}
      </h3>
      <p className="mb-5 text-[13px] leading-relaxed text-neutral-500">
        {state === 'working' ? 'One moment — signing you in.' : message}
      </p>
      {state === 'error' && (
        <button className={primaryButtonClass} onClick={goHome}>Back to Musee</button>
      )}
    </Shell>
  );
};

export const ResetPasswordPage: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetPassword(tokenFromLocation(), password);
      goHome();
    } catch (err) {
      setError(err instanceof EmailAuthError ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  return (
    <Shell>
      <h3 className="mb-2 text-lg font-bold text-neutral-900">Choose a new password</h3>
      <p className="mb-5 text-[13px] leading-relaxed text-neutral-500">
        Set the password you&apos;ll use to sign in to Musee with your email.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="New password (8+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className={inputClass}
        />
        {error && <p className="text-[12px] font-medium text-red-500">{error}</p>}
        <button type="submit" disabled={busy} className={primaryButtonClass}>
          {busy ? '…' : 'Set password & sign in'}
        </button>
      </form>
    </Shell>
  );
};
