import { describe, expect, it } from 'vitest';

import {
  presentArtworkAnalysisError,
  presentArtworkUploadError,
} from './captureErrorPresentation';
import { MobileArtworkAnalysisError } from './mobileArtworkAnalysisTransport';
import { MobileArtworkUploadHttpError } from './mobileArtworkUploadTransport';

const OPTIONS = {
  apiBaseUrl: 'https://api.musee.example/api',
  showTechnicalDetails: true,
};

describe('capture error presentation', () => {
  it('explains upload size limits without showing backend internals', () => {
    expect(presentArtworkUploadError(
      new MobileArtworkUploadHttpError(413, 'request rejected'),
      OPTIONS,
    )).toMatchObject({
      message: 'This photo is too large. Choose an image smaller than 10 MB.',
      technicalDetail: 'Upload HTTP 413 · API https://api.musee.example/api',
    });
  });

  it('keeps analysis implementation errors out of the user message', () => {
    const result = presentArtworkAnalysisError(
      new MobileArtworkAnalysisError('provider stack trace'),
      OPTIONS,
    );

    expect(result.message).not.toContain('stack trace');
    expect(result.technicalDetail).toBe('provider stack trace');
  });
});
