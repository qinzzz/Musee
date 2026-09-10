/** React Native's AbortSignal polyfill exposes aborted but not throwIfAborted. */
export function throwIfRequestCancelled(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Request cancelled.');
  error.name = 'AbortError';
  throw error;
}
