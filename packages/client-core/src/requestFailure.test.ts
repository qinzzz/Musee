import { describe, expect, it } from 'vitest';

import { classifyRequestFailure } from './requestFailure';

describe('request failure classification', () => {
  it('classifies aborted requests as timeouts', () => {
    const error = new Error('The operation was aborted.');
    error.name = 'AbortError';

    expect(classifyRequestFailure(error)).toBe('timeout');
  });

  it('classifies browser and native transport errors as network failures', () => {
    expect(classifyRequestFailure(new TypeError('Failed to fetch'))).toBe('network');
    expect(classifyRequestFailure(new Error('Network request failed'))).toBe('network');
  });

  it('does not guess when an error is unrelated to transport', () => {
    expect(classifyRequestFailure(new Error('Invalid response shape'))).toBe('unknown');
    expect(classifyRequestFailure('offline')).toBe('unknown');
  });
});
