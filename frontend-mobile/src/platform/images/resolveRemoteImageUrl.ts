import { resolveBackendOrigin } from '@musee/client-core';

export function resolveRemoteImageUrl(photoUri: string, apiBaseUrl: string): string {
  if (/^https?:\/\//.test(photoUri)) return photoUri;
  const backendOrigin = resolveBackendOrigin(apiBaseUrl).replace(/\/$/, '');
  const cleanPath = photoUri.replace(/^\//, '');
  return `${backendOrigin}/${cleanPath}`;
}
