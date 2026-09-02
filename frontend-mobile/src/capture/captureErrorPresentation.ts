import {
  presentRequestError,
  type RequestErrorPresentation,
} from '../api/requestErrorPresentation';
import { MobileArtworkAnalysisError } from './mobileArtworkAnalysisTransport';
import { MobileArtworkUploadHttpError } from './mobileArtworkUploadTransport';
import { NativeImageValidationError } from './nativeImageAsset';

const UPLOAD_FALLBACK = 'Musee could not upload this artwork. Please try again.';
const ANALYSIS_FALLBACK = 'Musee could not analyze this artwork. Try the analysis again.';

export type CaptureErrorPresentationOptions = {
  apiBaseUrl: string;
  showTechnicalDetails: boolean;
};

function requestPresentation(
  error: unknown,
  fallbackMessage: string,
  options: CaptureErrorPresentationOptions,
): RequestErrorPresentation {
  return presentRequestError(error, {
    apiBaseUrl: options.apiBaseUrl,
    fallbackMessage,
    showTechnicalDetails: options.showTechnicalDetails,
  });
}

export function presentArtworkUploadError(
  error: unknown,
  options: CaptureErrorPresentationOptions,
): RequestErrorPresentation {
  if (error instanceof NativeImageValidationError) {
    return { message: error.message };
  }
  if (error instanceof MobileArtworkUploadHttpError) {
    const message = error.status === 413 || /too large/i.test(error.detail ?? '')
      ? 'This photo is too large. Choose an image smaller than 10 MB.'
      : UPLOAD_FALLBACK;
    return {
      message,
      technicalDetail: options.showTechnicalDetails
        ? `Upload HTTP ${error.status} · API ${options.apiBaseUrl}`
        : undefined,
    };
  }
  return requestPresentation(error, UPLOAD_FALLBACK, options);
}

export function presentArtworkAnalysisError(
  error: unknown,
  options: CaptureErrorPresentationOptions,
): RequestErrorPresentation {
  if (error instanceof MobileArtworkAnalysisError) {
    return {
      message: ANALYSIS_FALLBACK,
      technicalDetail: options.showTechnicalDetails ? error.message : undefined,
    };
  }
  return requestPresentation(error, ANALYSIS_FALLBACK, options);
}
