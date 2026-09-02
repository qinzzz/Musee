import { describe, expect, it } from 'vitest';

import { MobileRuntimeConfigurationError } from '../config/mobileRuntimeConfig';
import { presentAuthError } from './authErrorPresentation';
import { MobileAuthStorageError } from './mobileAuthService';
import { MobileAuthHttpError } from './mobileAuthTransport';

const OPTIONS = {
  apiBaseUrl: 'http://192.168.1.10:8000/api',
  showTechnicalDetails: true,
};

describe('auth error presentation', () => {
  it('keeps expected credential failures specific', () => {
    expect(presentAuthError(
      new MobileAuthHttpError(401, 'invalid_credentials'),
      OPTIONS,
    )).toEqual({
      message: 'Incorrect email or password.',
      technicalDetail: 'HTTP 401 · API http://192.168.1.10:8000/api',
    });
  });

  it('makes physical-device loopback configuration actionable', () => {
    const result = presentAuthError(
      new MobileRuntimeConfigurationError('physical_device_loopback'),
      OPTIONS,
    );

    expect(result.message).toContain('Restart Metro with EXPO_PUBLIC_API_URL');
    expect(result.technicalDetail).toContain('physical_device_loopback');
  });

  it('distinguishes network, timeout, and secure storage failures', () => {
    const timeout = new Error('aborted');
    timeout.name = 'AbortError';

    expect(presentAuthError(new TypeError('Network request failed'), OPTIONS).message)
      .toContain('could not reach');
    expect(presentAuthError(timeout, OPTIONS).message).toContain('too long');
    expect(presentAuthError(new MobileAuthStorageError('read'), OPTIONS).message)
      .toContain('secure sign-in storage');
  });

  it('hides diagnostics outside development builds', () => {
    expect(presentAuthError(new TypeError('Failed to fetch'), {
      ...OPTIONS,
      showTechnicalDetails: false,
    }).technicalDetail).toBeUndefined();
  });
});
