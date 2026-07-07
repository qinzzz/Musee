import { describe, expect, it } from 'vitest';
import { parseQuotaError } from './account';

describe('parseQuotaError', () => {
  it('parses the structured 402 quota body', () => {
    const error = new Error(
      'API error (402): {"detail": {"error_code": "quota_exceeded", "code": "quota_exceeded", '
      + '"quota": "artwork_uploads", "limit": 10, "used": 10, '
      + '"resets_at": "2026-07-08T00:00:00Z", "tier": "free", '
      + '"message": "You have reached today\'s limit of 10 artwork uploads."}}',
    );
    const parsed = parseQuotaError(error);
    expect(parsed).toMatchObject({
      quota: 'artwork_uploads',
      limit: 10,
      used: 10,
      resetsAt: '2026-07-08T00:00:00Z',
    });
    expect(parsed?.message).toContain('limit of 10 artwork uploads');
  });

  it('falls back to a generic message for unparseable 402s', () => {
    expect(parseQuotaError(new Error('API error (402): Payment Required'))?.message)
      .toBe('You have reached your plan limit.');
  });

  it('returns null for non-quota errors', () => {
    expect(parseQuotaError(new Error('API error (500): boom'))).toBeNull();
    expect(parseQuotaError(new Error('network down'))).toBeNull();
    expect(parseQuotaError('not an error')).toBeNull();
  });
});
