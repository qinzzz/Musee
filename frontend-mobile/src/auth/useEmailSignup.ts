import { useRef, useState } from 'react';
import { MOBILE_API_BASE_URL, mobileEmailSignupService } from '../api/runtime';
import { presentAuthError } from './authErrorPresentation';
import { MobileAuthHttpError } from './mobileAuthTransport';
import { useEmailCooldown } from './useEmailCooldown';

const COPY = {
  email: 'Enter a valid email address.',
  password: 'Use at least 8 characters for your password.',
  mismatch: 'Passwords do not match.',
  exists: 'An account with this email already exists. Sign in with your password or Google.',
  delivery: 'Your account is awaiting verification, but we could not send the email. Please try resending it.',
  throttle: 'Too many attempts. Please wait for the countdown before trying again.',
} as const;

export function useEmailSignup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const cooldown = useEmailCooldown();

  async function submit() {
    if (inFlight.current || cooldown.isActive()) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError(COPY.email); return; }
    if (password.length < 8) { setError(COPY.password); return; }
    if (password !== confirmation) { setError(COPY.mismatch); return; }
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      const result = await mobileEmailSignupService.signup(email.trim(), password);
      setPendingVerification(true);
      setEmailSent(result.emailSent);
      if (!result.emailSent) setError(COPY.delivery);
      cooldown.start(60);
    } catch (cause) {
      if (cause instanceof MobileAuthHttpError && cause.status === 429) {
        cooldown.start(cause.retryAfterSeconds ?? 300);
        setError(COPY.throttle);
      } else if (cause instanceof MobileAuthHttpError && cause.code === 'email_exists') {
        setError(COPY.exists);
      } else {
        setError(presentAuthError(cause, { apiBaseUrl: MOBILE_API_BASE_URL, showTechnicalDetails: false }).message);
      }
    } finally { inFlight.current = false; setSending(false); }
  }
  function edit() { setPendingVerification(false); setEmailSent(false); setError(null); }
  return { email, setEmail, password, setPassword, confirmation, setConfirmation,
    pendingVerification, emailSent, sending, error, submit, edit, remainingSeconds: cooldown.remainingSeconds };
}
