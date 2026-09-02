import { classifyRequestFailure } from '@musee/client-core';

export type RequestErrorPresentation = {
  message: string;
  technicalDetail?: string;
};

export type RequestErrorPresentationOptions = {
  apiBaseUrl: string;
  fallbackMessage: string;
  showTechnicalDetails: boolean;
};

export function presentRequestError(
  error: unknown,
  options: RequestErrorPresentationOptions,
): RequestErrorPresentation {
  const failureKind = classifyRequestFailure(error);
  const message = failureKind === 'timeout'
    ? 'The Musee server took too long to respond. Please try again.'
    : failureKind === 'network'
      ? 'Musee could not reach the server. Check your connection and try again.'
      : options.fallbackMessage;

  if (!options.showTechnicalDetails) {
    return { message };
  }

  const errorLabel = error instanceof Error ? error.name : 'UnknownError';
  return {
    message,
    technicalDetail: `${errorLabel} · API ${options.apiBaseUrl}`,
  };
}
