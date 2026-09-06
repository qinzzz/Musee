import { describe, expect, it } from 'vitest';

import { shouldRetryQuery } from './queryClient';

describe('mobile query retry policy', () => {
  it('retries transient failures at most twice', () => {
    expect(shouldRetryQuery(0, new TypeError('Network unavailable'))).toBe(true);
    expect(shouldRetryQuery(1, { status: 503 })).toBe(true);
    expect(shouldRetryQuery(2, { status: 503 })).toBe(false);
  });

  it('does not retry permanent client errors', () => {
    expect(shouldRetryQuery(0, { status: 401 })).toBe(false);
    expect(shouldRetryQuery(0, { status: 404 })).toBe(false);
    expect(shouldRetryQuery(0, { status: 429 })).toBe(true);
  });
});
