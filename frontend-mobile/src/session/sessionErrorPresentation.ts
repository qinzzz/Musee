import { classifyRequestFailure } from '@musee/client-core';

import { MobileSessionHttpError, MobileSessionStreamError } from './mobileSessionTransport';

export type SessionFailureStage =
  | 'load'
  | 'response_save'
  | 'stream'
  | 'user_save';

export type SessionErrorPresentation = {
  message: string;
  technicalDetail?: string;
};

const STAGE_FALLBACKS: Record<SessionFailureStage, string> = {
  load: 'Musee could not load this session.',
  response_save: 'The response appeared, but Musee could not save it. Try saving again.',
  stream: 'The response was interrupted. Please try again.',
  user_save: 'Musee could not save your message. Please try again.',
};

export function presentSessionError(
  error: unknown,
  stage: SessionFailureStage,
  options: { apiBaseUrl: string; showTechnicalDetails: boolean },
): SessionErrorPresentation {
  let message = STAGE_FALLBACKS[stage];
  let label = error instanceof Error ? error.name : 'UnknownError';

  if (error instanceof MobileSessionHttpError) {
    label = `HTTP ${error.status}${error.code ? ` ${error.code}` : ''}`;
    if (error.status >= 500) {
      message = 'The Musee service is temporarily unavailable. Please try again.';
    } else if (error.status === 429) {
      message = 'You have reached the current Session limit. Please try again later.';
    }
  } else {
    const failureKind = classifyRequestFailure(error);
    if (failureKind === 'network') {
      message = 'Musee could not reach the server. Check your connection and try again.';
      label = 'Network unavailable';
    } else if (failureKind === 'timeout') {
      message = 'The Musee server took too long to respond. Please try again.';
      label = 'Request timed out';
    } else if (error instanceof MobileSessionStreamError) {
      label = error.message;
    }
  }

  return {
    message,
    technicalDetail: options.showTechnicalDetails
      ? `${label} · API ${options.apiBaseUrl}`
      : undefined,
  };
}
