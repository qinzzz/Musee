import { expect, it } from 'vitest';
import type { QuotaEntry } from '@musee/client-core';
import { usageFraction, usageStatus } from './usagePresentation';
const quota: QuotaEntry = { used: 5, limit: 10, period: 'day', resets_at: null, warning: false, exceeded: false, on_exceed: 'block' };

it('bounds meter fills including zero and unlimited limits', () => {
  expect(usageFraction(quota)).toBe(0.5);
  expect(usageFraction({ ...quota, used: 20 })).toBe(1);
  expect(usageFraction({ ...quota, limit: 0 })).toBe(1);
  expect(usageFraction({ ...quota, limit: null })).toBe(0);
});
it('renders warning/limit messages and the backend reset instant in local time', () => {
  expect(usageStatus(quota)).toBeNull();
  expect(usageStatus({ ...quota, warning: true })).toBe('Approaching limit');
  expect(usageStatus({ ...quota, exceeded: true })).toBe('Limit reached');
  expect(usageStatus({ ...quota, exceeded: true, resets_at: 'invalid' })).toBe('Limit reached');
  const instant = '2026-09-10T00:00:00Z';
  const formatted = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(instant));
  expect(usageStatus({ ...quota, exceeded: true, resets_at: instant })).toBe(`Limit reached · resets ${formatted}`);
});
