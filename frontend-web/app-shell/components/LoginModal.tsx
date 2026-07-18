import React, { useState } from 'react';
import GoogleLogin from '../../components/GoogleLogin';
import {
  EmailAuthError,
  loginWithEmail,
  requestPasswordReset,
  signupWithEmail,
} from '../../api/auth';

type Props = {
  open: boolean;
  onClose: () => void;
  onLoginSuccess: (user: any) => void;
  onLoginError?: () => void;
};

type Mode = 'login' | 'signup' | 'forgot';

// Human copy for error codes the backend intentionally ships bare (the API
// stays information-free; the UI says what the user needs to hear).
const FRIENDLY_ERRORS: Record<string, string> = {
  invalid_credentials: 'Incorrect email or password.',
  invalid_email: 'That does not look like a valid email address.',
  rate_limited: 'Too many attempts. Please wait a minute and try again.',
};

const inputClass =
  'w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] text-neutral-900 ' +
  'placeholder:text-neutral-400 outline-none transition-colors focus:border-neutral-400';

const primaryButtonClass =
  'w-full rounded-xl bg-neutral-900 px-3 py-2 text-[13px] font-semibold text-white transition-opacity ' +
  'hover:opacity-90 disabled:opacity-50';

const LoginModal: React.FC<Props> = ({
  open,
  onClose,
  onLoginSuccess,
  onLoginError,
}) => {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [offerSetPassword, setOfferSetPassword] = useState(false);

  if (!open) return null;

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setOfferSetPassword(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    setOfferSetPassword(false);
    try {
      if (mode === 'forgot') {
        await requestPasswordReset(email);
        setNotice('If an account exists for that email, a reset link is on its way. Check your inbox.');
      } else if (mode === 'signup') {
        await signupWithEmail(email, password);
        setNotice('Almost there — check your inbox and click the verification link to finish signing up.');
      } else {
        const data = await loginWithEmail(email, password);
        onLoginSuccess(data.user);
      }
    } catch (err) {
      if (err instanceof EmailAuthError && err.code === 'email_unverified') {
        setNotice('This email is not verified yet. Check your inbox for the link, or sign up again to resend it.');
      } else if (err instanceof EmailAuthError && err.code === 'password_not_set') {
        // Google-first account: guide instead of scold, and offer the fix.
        setNotice(err.message);
        setOfferSetPassword(true);
      } else if (err instanceof EmailAuthError) {
        setError(FRIENDLY_ERRORS[err.code] || err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'signup' ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Sign in to Musee';
  const submitLabel = mode === 'signup' ? 'Sign up' : mode === 'forgot' ? 'Send reset link' : 'Sign in';

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <h3 className="mb-2 text-lg font-bold text-neutral-900">{title}</h3>
        <p className="mb-5 text-[13px] leading-relaxed text-neutral-500">
          {mode === 'forgot'
            ? 'Enter your email and we will send you a link to reset (or set) your password.'
            : 'Save your collections across devices, view your taste profile, and keep your artwork history.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
          {mode !== 'forgot' && (
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder={mode === 'signup' ? 'Password (8+ characters)' : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          )}

          {error && <p className="text-[12px] font-medium text-red-500">{error}</p>}
          {notice && <p className="text-[12px] font-medium text-neutral-600">{notice}</p>}
          {offerSetPassword && (
            <button
              type="button"
              disabled={busy}
              className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-[13px] font-semibold text-neutral-800 transition-colors hover:bg-neutral-50 disabled:opacity-50"
              onClick={async () => {
                setBusy(true);
                try {
                  await requestPasswordReset(email);
                  setNotice('Check your inbox — we sent you a link to set a password.');
                  setOfferSetPassword(false);
                } catch {
                  setError('Something went wrong. Please try again.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              Email me a set-password link
            </button>
          )}

          <button type="submit" disabled={busy} className={primaryButtonClass}>
            {busy ? '…' : submitLabel}
          </button>
        </form>

        <div className="mt-3 flex items-center justify-between text-[12px] text-neutral-500">
          {mode === 'login' && (
            <>
              <button className="hover:text-neutral-800" onClick={() => switchMode('forgot')}>
                Forgot password?
              </button>
              <button className="font-semibold hover:text-neutral-800" onClick={() => switchMode('signup')}>
                Create an account
              </button>
            </>
          )}
          {mode !== 'login' && (
            <button className="hover:text-neutral-800" onClick={() => switchMode('login')}>
              ← Back to sign in
            </button>
          )}
        </div>

        {mode !== 'forgot' && (
          <>
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-neutral-200" />
              <span className="text-[11px] text-neutral-400">or</span>
              <div className="h-px flex-1 bg-neutral-200" />
            </div>
            <div className="flex justify-center">
              <GoogleLogin
                onLoginSuccess={onLoginSuccess}
                onLoginError={onLoginError || (() => {})}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LoginModal;
