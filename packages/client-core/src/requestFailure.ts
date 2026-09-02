export type RequestFailureKind = 'network' | 'timeout' | 'unknown';

const NETWORK_ERROR_MESSAGES = [
  'failed to fetch',
  'internet connection appears to be offline',
  'load failed',
  'network request failed',
] as const;

export function classifyRequestFailure(error: unknown): RequestFailureKind {
  if (!(error instanceof Error)) {
    return 'unknown';
  }

  if (error.name === 'AbortError') {
    return 'timeout';
  }

  const message = error.message.toLowerCase();
  return NETWORK_ERROR_MESSAGES.some((candidate) => message.includes(candidate))
    ? 'network'
    : 'unknown';
}
