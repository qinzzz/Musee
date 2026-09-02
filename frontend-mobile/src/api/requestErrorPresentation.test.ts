import { describe, expect, it } from 'vitest';

import { presentRequestError } from './requestErrorPresentation';

const OPTIONS = {
  apiBaseUrl: 'https://api.musee.example/api',
  fallbackMessage: 'The request failed.',
  showTechnicalDetails: true,
};

describe('request error presentation', () => {
  it('turns transport failures into useful messages', () => {
    expect(presentRequestError(new TypeError('Network request failed'), OPTIONS).message)
      .toContain('could not reach');

    const timeout = new Error('aborted');
    timeout.name = 'AbortError';
    expect(presentRequestError(timeout, OPTIONS).message).toContain('too long');
  });

  it('uses the domain fallback without leaking an exception message', () => {
    expect(presentRequestError(new Error('internal implementation detail'), OPTIONS))
      .toEqual({
        message: 'The request failed.',
        technicalDetail: 'Error · API https://api.musee.example/api',
      });
  });
});
