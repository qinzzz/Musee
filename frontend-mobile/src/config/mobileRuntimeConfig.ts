export type MobileAppEnvironment = 'development' | 'preview' | 'production';

export type MobileRuntimeConfigurationErrorCode =
  | 'insecure_api_url'
  | 'invalid_api_url'
  | 'invalid_environment'
  | 'missing_api_url'
  | 'physical_device_loopback';

export type MobileRuntimeConfiguration = {
  apiBaseUrl: string;
  environment: MobileAppEnvironment;
  error: MobileRuntimeConfigurationError | null;
  isPhysicalDevice: boolean;
};

export type MobileRuntimeConfigurationInput = {
  configuredApiBaseUrl?: string;
  configuredEnvironment?: string;
  isDevelopmentBuild: boolean;
  isPhysicalDevice: boolean;
};

const DEFAULT_SIMULATOR_API_BASE_URL = 'http://127.0.0.1:8000/api';
const VALID_ENVIRONMENTS = new Set<MobileAppEnvironment>([
  'development',
  'preview',
  'production',
]);

const ERROR_MESSAGES: Record<MobileRuntimeConfigurationErrorCode, string> = {
  insecure_api_url: 'This build requires a secure HTTPS API address.',
  invalid_api_url: 'The configured Musee API address is invalid. It must be an HTTP(S) URL ending in /api.',
  invalid_environment: 'The configured Musee app environment is invalid.',
  missing_api_url: 'This build needs an explicit Musee API address.',
  physical_device_loopback: 'This iPhone is pointing to itself instead of your computer. Restart Metro with EXPO_PUBLIC_API_URL set to your computer’s LAN API address.',
};

export class MobileRuntimeConfigurationError extends Error {
  readonly code: MobileRuntimeConfigurationErrorCode;

  constructor(code: MobileRuntimeConfigurationErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'MobileRuntimeConfigurationError';
    this.code = code;
  }
}

function resolveEnvironment(
  configuredEnvironment: string | undefined,
  isDevelopmentBuild: boolean,
): MobileAppEnvironment | MobileRuntimeConfigurationError {
  const candidate = configuredEnvironment?.trim().toLowerCase();
  if (!candidate) {
    return isDevelopmentBuild ? 'development' : 'production';
  }
  if (VALID_ENVIRONMENTS.has(candidate as MobileAppEnvironment)) {
    return candidate as MobileAppEnvironment;
  }
  return new MobileRuntimeConfigurationError('invalid_environment');
}

function normalizeApiBaseUrl(value: string): string | MobileRuntimeConfigurationError {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return new MobileRuntimeConfigurationError('invalid_api_url');
    }

    const normalizedPath = url.pathname.replace(/\/+$/, '');
    if (normalizedPath && normalizedPath !== '/api') {
      return new MobileRuntimeConfigurationError('invalid_api_url');
    }
    url.pathname = '/api';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return new MobileRuntimeConfigurationError('invalid_api_url');
  }
}

function isLoopbackHost(apiBaseUrl: string): boolean {
  const hostname = new URL(apiBaseUrl).hostname.toLowerCase();
  return hostname === 'localhost'
    || hostname === '::1'
    || hostname === '[::1]'
    || hostname.startsWith('127.');
}

export function createMobileRuntimeConfiguration({
  configuredApiBaseUrl,
  configuredEnvironment,
  isDevelopmentBuild,
  isPhysicalDevice,
}: MobileRuntimeConfigurationInput): MobileRuntimeConfiguration {
  const resolvedEnvironment = resolveEnvironment(
    configuredEnvironment,
    isDevelopmentBuild,
  );
  const environment = resolvedEnvironment instanceof MobileRuntimeConfigurationError
    ? (isDevelopmentBuild ? 'development' : 'production')
    : resolvedEnvironment;
  const configuredUrl = configuredApiBaseUrl?.trim();
  const normalizedUrl = configuredUrl
    ? normalizeApiBaseUrl(configuredUrl)
    : DEFAULT_SIMULATOR_API_BASE_URL;
  const apiBaseUrl = normalizedUrl instanceof MobileRuntimeConfigurationError
    ? DEFAULT_SIMULATOR_API_BASE_URL
    : normalizedUrl;

  let error: MobileRuntimeConfigurationError | null = null;
  if (resolvedEnvironment instanceof MobileRuntimeConfigurationError) {
    error = resolvedEnvironment;
  } else if (!configuredUrl && (isPhysicalDevice || environment !== 'development')) {
    error = new MobileRuntimeConfigurationError('missing_api_url');
  } else if (normalizedUrl instanceof MobileRuntimeConfigurationError) {
    error = normalizedUrl;
  } else if (isPhysicalDevice && isLoopbackHost(apiBaseUrl)) {
    error = new MobileRuntimeConfigurationError('physical_device_loopback');
  } else if (environment !== 'development' && new URL(apiBaseUrl).protocol !== 'https:') {
    error = new MobileRuntimeConfigurationError('insecure_api_url');
  }

  return {
    apiBaseUrl,
    environment,
    error,
    isPhysicalDevice,
  };
}
