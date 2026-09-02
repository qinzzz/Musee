import { classifyRequestFailure } from '@musee/client-core';

import { MobileRuntimeConfigurationError } from '../config/mobileRuntimeConfig';
import {
  MobileAuthContractError,
  MobileAuthStorageError,
} from './mobileAuthService';
import { MobileAuthSessionError } from './mobileAuthSession';
import { MobileAuthHttpError } from './mobileAuthTransport';

export type AuthErrorPresentation = {
  message: string;
  technicalDetail?: string;
};

export type AuthErrorPresentationOptions = {
  apiBaseUrl: string;
  showTechnicalDetails: boolean;
};

const GENERIC_ERROR = 'Something went wrong. Please try again.';
const HTTP_ERROR_MESSAGES: Record<string, string> = {
  email_unverified: 'Check your inbox and verify your email before signing in.',
  invalid_credentials: 'Incorrect email or password.',
  password_not_set: 'This account uses Google sign-in and does not have a password yet.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
};

function detail(
  value: string,
  { apiBaseUrl, showTechnicalDetails }: AuthErrorPresentationOptions,
): string | undefined {
  return showTechnicalDetails ? `${value} · API ${apiBaseUrl}` : undefined;
}

export function presentAuthError(
  error: unknown,
  options: AuthErrorPresentationOptions,
): AuthErrorPresentation {
  if (error instanceof MobileRuntimeConfigurationError) {
    return {
      message: error.message,
      technicalDetail: options.showTechnicalDetails
        ? `Configuration ${error.code}`
        : undefined,
    };
  }

  if (error instanceof MobileAuthHttpError) {
    const message = (error.code && HTTP_ERROR_MESSAGES[error.code])
      || (error.status === 401 ? HTTP_ERROR_MESSAGES.invalid_credentials : null)
      || (error.status === 429 ? HTTP_ERROR_MESSAGES.rate_limited : null)
      || (error.status >= 500
        ? 'The Musee service is temporarily unavailable. Please try again.'
        : GENERIC_ERROR);
    return {
      message,
      technicalDetail: detail(`HTTP ${error.status}`, options),
    };
  }

  if (error instanceof MobileAuthStorageError) {
    return {
      message: 'Musee could not access secure sign-in storage on this device. Please try again.',
      technicalDetail: detail(`SecureStore ${error.operation}`, options),
    };
  }

  if (error instanceof MobileAuthContractError) {
    return {
      message: 'The Musee service returned an unexpected sign-in response. Please try again later.',
      technicalDetail: detail('Invalid auth response', options),
    };
  }

  if (error instanceof MobileAuthSessionError) {
    return {
      message: error.status >= 500
        ? 'The Musee service is temporarily unavailable. Please try again.'
        : 'Musee could not restore your account. Please sign in again.',
      technicalDetail: detail(`Session HTTP ${error.status}`, options),
    };
  }

  const failureKind = classifyRequestFailure(error);
  if (failureKind === 'timeout') {
    return {
      message: 'The Musee server took too long to respond. Please try again.',
      technicalDetail: detail('Request timed out', options),
    };
  }
  if (failureKind === 'network') {
    return {
      message: 'Musee could not reach the server. Check your connection and try again.',
      technicalDetail: detail('Network unavailable', options),
    };
  }

  return {
    message: GENERIC_ERROR,
    technicalDetail: detail('Unexpected auth error', options),
  };
}
