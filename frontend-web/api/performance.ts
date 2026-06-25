const API_TIMING_STORAGE_KEY = 'musee_debug_timing';

type ApiTimingLog = {
  method: string;
  resource: string;
  durationMs: number;
  status?: number;
  serverTiming?: string | null;
  responseTime?: string | null;
  errorName?: string;
};

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function shouldLogApiTiming(): boolean {
  if (!isBrowser()) return false;
  return import.meta.env.DEV || localStorage.getItem(API_TIMING_STORAGE_KEY) === '1';
}

export function getApiTimingHeaders(response: Response): {
  serverTiming: string | null;
  responseTime: string | null;
} {
  return {
    serverTiming: response.headers.get('Server-Timing'),
    responseTime: response.headers.get('X-Response-Time'),
  };
}

export function logApiTiming({
  method,
  resource,
  durationMs,
  status,
  serverTiming,
  responseTime,
  errorName,
}: ApiTimingLog): void {
  if (!shouldLogApiTiming()) return;

  const statusLabel = status ? `${status}` : 'ERR';
  const backendBits = [serverTiming, responseTime].filter(Boolean).join(' | ');
  const suffix = errorName
    ? ` (${errorName})`
    : backendBits
      ? ` [${backendBits}]`
      : '';

  console.info(
    `[api] ${method.toUpperCase()} ${resource} ${statusLabel} ${durationMs.toFixed(1)}ms${suffix}`,
  );
}
