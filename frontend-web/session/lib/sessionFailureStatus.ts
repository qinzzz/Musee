import type { ArtworkUploadFailureCode } from '../../lib/uploadValidation';

export const SESSION_FAILURE_MESSAGES = {
  network: 'Network error. Check your connection and try again.',
  timeout: 'Request timed out. Please try again.',
  upload: 'Couldn’t upload the artwork. Please try again.',
  analysis: 'Analysis failed',
  session: 'Couldn’t save this session',
} as const;

export type SessionFailureKind = 'upload_failure' | 'analysis_failure' | 'session_failure';

export function getSessionUploadFailureStatus(
  errorCodes: Array<ArtworkUploadFailureCode | undefined>,
): { message: string; errorCode: ArtworkUploadFailureCode } {
  if (errorCodes.length > 0 && errorCodes.every((code) => code === 'request_timeout')) {
    return { message: SESSION_FAILURE_MESSAGES.timeout, errorCode: 'request_timeout' };
  }
  if (errorCodes.length > 0 && errorCodes.every((code) => code === 'network_error')) {
    return { message: SESSION_FAILURE_MESSAGES.network, errorCode: 'network_error' };
  }
  return { message: SESSION_FAILURE_MESSAGES.upload, errorCode: 'server_error' };
}

export function shouldShowInlineSessionUploadFailure(
  errorCodes: Array<ArtworkUploadFailureCode | undefined>,
): boolean {
  return errorCodes.length > 0 && errorCodes.every((code) => (
    code !== 'validation_error' && code !== 'quota_exceeded'
  ));
}

export function isSessionFailureMessageKind(value: unknown): value is SessionFailureKind {
  return value === 'upload_failure' || value === 'analysis_failure' || value === 'session_failure';
}
