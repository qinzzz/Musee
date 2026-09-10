import { useRef, useState } from 'react';
import { useEmailCooldown } from './useEmailCooldown';
import { MOBILE_API_BASE_URL, mobilePasswordRecoveryService } from '../api/runtime';
import { presentAuthError } from './authErrorPresentation';

const INVALID_EMAIL = 'Enter a valid email address.';
const RATE_LIMITED = 'Too many attempts. Please wait for the countdown before requesting another link.';
const RESEND_COOLDOWN_SECONDS = 60;
const RATE_LIMIT_FALLBACK_SECONDS = 300;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function usePasswordRecovery() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const { start: startCooldown, remainingSeconds, isActive } = useEmailCooldown();

  async function submit() {
    if (inFlight.current || isActive()) return;
    const normalized = email.trim();
    if (!EMAIL_PATTERN.test(normalized)) { setError(INVALID_EMAIL); return; }
    inFlight.current = true;
    setSending(true);
    setError(null);
    try {
      await mobilePasswordRecoveryService.requestReset(normalized);
      setSent(true);
      startCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (cause) {
      const status = (cause as { status?: number } | null)?.status;
      if (status === 429) {
        const retryAfter = (cause as { retryAfterSeconds?: number }).retryAfterSeconds;
        startCooldown(retryAfter && Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter : RATE_LIMIT_FALLBACK_SECONDS);
      }
      setError(status === 429 ? RATE_LIMITED : presentAuthError(cause, {
        apiBaseUrl: MOBILE_API_BASE_URL, showTechnicalDetails: false,
      }).message);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  function editEmail() { setSent(false); setError(null); }
  return { email, setEmail, sending, sent, error, submit, editEmail, remainingSeconds };
}
