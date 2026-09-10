import { expect, it, vi } from 'vitest';
import { createEmailSignupService } from './emailSignupService';

it('requests verification without creating a native login session and reports delivery status', async () => {
  const fetchWithTimeout = vi.fn(async () => Response.json({ ok: true, verification_required: true, email_sent: true }));
  const service = createEmailSignupService({ fetchWithTimeout }, '/api');
  expect(await service.signup(' person@example.com ', 'long-password')).toEqual({ emailSent: true });
  expect(fetchWithTimeout).toHaveBeenCalledWith('/api/auth/signup', {
    method: 'POST', credentials: 'omit', timeout: 15000,
    headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'ios' },
    body: JSON.stringify({ email: 'person@example.com', password: 'long-password' }),
  });
  fetchWithTimeout.mockResolvedValueOnce(Response.json({ ok: true, verification_required: true, email_sent: false }));
  expect(await service.signup('person@example.com', 'long-password')).toEqual({ emailSent: false });
});

it('preserves existing-account and rate-limit errors and rejects malformed success', async () => {
  const fetchWithTimeout = vi.fn(async () => Response.json({ detail: { error_code: 'email_exists' } }, { status: 409 }));
  const service = createEmailSignupService({ fetchWithTimeout }, '/api');
  await expect(service.signup('a@example.com', 'long-password')).rejects.toMatchObject({ code: 'email_exists', status: 409 });
  fetchWithTimeout.mockResolvedValueOnce(Response.json({ detail: { retry_after_seconds: 120 } }, { status: 429 }));
  await expect(service.signup('a@example.com', 'long-password')).rejects.toMatchObject({ retryAfterSeconds: 120 });
  fetchWithTimeout.mockResolvedValueOnce(Response.json({ ok: true }));
  await expect(service.signup('a@example.com', 'long-password')).rejects.toThrow('Unexpected');
});
