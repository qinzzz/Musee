import { expect, it, vi } from 'vitest';
import { createAccountService, getMeteredQuotas, type QuotaEntry } from './account';

const quota: QuotaEntry = { used: 5, limit: 10, period: 'day', resets_at: null, warning: false, exceeded: false, on_exceed: 'block' };
it('loads account-scoped usage with encoded identity and preserves backend policies', async () => {
  const usage = { tier: 'free', quotas: { artwork_uploads: quota } };
  const fetchWithTimeout = vi.fn(async () => Response.json(usage));
  const service = createAccountService({ fetchWithTimeout }, '/api');
  expect(await service.usage('u/1')).toEqual(usage);
  expect(fetchWithTimeout).toHaveBeenCalledWith('/api/users/u%2F1/quota', { timeout: 8000 });
  fetchWithTimeout.mockResolvedValueOnce(new Response('', { status: 403 }));
  await expect(service.usage('u')).rejects.toMatchObject({ status: 403 });
  fetchWithTimeout.mockRejectedValueOnce(new TypeError('offline'));
  await expect(service.usage('u')).rejects.toThrow('offline');
});

it('shows enforced and warning quotas, excluding unlimited and tracking-only quotas', () => {
  expect(getMeteredQuotas({ tier: 'custom', quotas: {
    blocked: quota,
    warning: { ...quota, on_exceed: 'warn' },
    unlimited: { ...quota, limit: null },
    tracking: { ...quota, on_exceed: 'allow' },
  } }).map(([key]) => key)).toEqual(['blocked', 'warning']);
  expect(getMeteredQuotas({ tier: 'unlimited', quotas: { uploads: { ...quota, limit: null } } })).toEqual([]);
});
