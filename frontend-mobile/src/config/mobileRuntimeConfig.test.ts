import { describe, expect, it } from 'vitest';

import { createMobileRuntimeConfiguration } from './mobileRuntimeConfig';

const BASE_INPUT = {
  isDevelopmentBuild: true,
  isPhysicalDevice: false,
} as const;

describe('mobile runtime configuration', () => {
  it('uses the local backend only for simulator development', () => {
    expect(createMobileRuntimeConfiguration(BASE_INPUT)).toMatchObject({
      apiBaseUrl: 'http://127.0.0.1:8000/api',
      environment: 'development',
      error: null,
    });
  });

  it('normalizes an explicit API origin', () => {
    expect(createMobileRuntimeConfiguration({
      ...BASE_INPUT,
      configuredApiBaseUrl: ' https://api.musee.example/ ',
    })).toMatchObject({
      apiBaseUrl: 'https://api.musee.example/api',
      error: null,
    });
  });

  it('rejects missing and loopback API addresses on a physical device', () => {
    expect(createMobileRuntimeConfiguration({
      ...BASE_INPUT,
      isPhysicalDevice: true,
    }).error).toMatchObject({ code: 'missing_api_url' });

    expect(createMobileRuntimeConfiguration({
      ...BASE_INPUT,
      configuredApiBaseUrl: 'http://localhost:8000/api',
      isPhysicalDevice: true,
    }).error).toMatchObject({ code: 'physical_device_loopback' });
  });

  it('requires explicit HTTPS outside development', () => {
    expect(createMobileRuntimeConfiguration({
      ...BASE_INPUT,
      configuredApiBaseUrl: 'http://api.musee.example/api',
      configuredEnvironment: 'production',
    }).error).toMatchObject({ code: 'insecure_api_url' });
  });

  it('rejects invalid environments and API paths', () => {
    expect(createMobileRuntimeConfiguration({
      ...BASE_INPUT,
      configuredEnvironment: 'staging',
    }).error).toMatchObject({ code: 'invalid_environment' });

    expect(createMobileRuntimeConfiguration({
      ...BASE_INPUT,
      configuredApiBaseUrl: 'https://api.musee.example/v1',
    }).error).toMatchObject({ code: 'invalid_api_url' });
  });
});
