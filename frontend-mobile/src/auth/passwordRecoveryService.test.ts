import { expect, it, vi } from 'vitest';
import { createPasswordRecoveryService } from './passwordRecoveryService';

it('requests recovery without credentials and treats known/unknown accounts identically', async () => {
  const fetchWithTimeout = vi.fn(async () => Response.json({ ok: true }));
  const service = createPasswordRecoveryService({ fetchWithTimeout }, 'https://api.test/api');
  await expect(service.requestReset(' user@example.com ')).resolves.toBeUndefined();
  expect(fetchWithTimeout).toHaveBeenCalledWith('https://api.test/api/auth/request-password-reset', {
    method: 'POST', credentials: 'omit', timeout: 15000,
    headers: { 'Content-Type': 'application/json', 'X-Client-Platform': 'ios' },
    body: JSON.stringify({ email: 'user@example.com' }),
  });
  await expect(service.requestReset('unknown@example.com')).resolves.toBeUndefined();
});

it('preserves throttling and network failures without pretending an email was sent', async () => {
  const fetchWithTimeout = vi.fn(async () => new Response('', { status: 429 }));
  const service = createPasswordRecoveryService({ fetchWithTimeout }, '/api');
  await expect(service.requestReset('user@example.com')).rejects.toMatchObject({ status: 429 });
  fetchWithTimeout.mockResolvedValueOnce(Response.json({ detail: { retry_after_seconds: 120 } }, { status: 429 }));
  await expect(service.requestReset('user@example.com')).rejects.toMatchObject({ status: 429, retryAfterSeconds: 120 });
  fetchWithTimeout.mockRejectedValueOnce(new TypeError('Network request failed'));
  await expect(service.requestReset('user@example.com')).rejects.toThrow('Network request failed');
  fetchWithTimeout.mockResolvedValueOnce(Response.json({}));
  await expect(service.requestReset('user@example.com')).rejects.toThrow('Unexpected');
});
