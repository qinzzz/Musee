import { describe, expect, it } from 'vitest';
import {
  MAX_UPLOAD_FILE_SIZE_BYTES,
  buildBatchUploadFailureMessage,
  buildOversizedUploadMessage,
  getArtworkUploadErrorMessage,
  isOversizedUploadImage,
} from './uploadValidation';

function createSizedFile(name: string, size: number) {
  const file = new File(['image'], name, { type: 'image/jpeg' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('upload validation', () => {
  it('accepts the exact 10 MB limit and rejects anything larger', () => {
    expect(isOversizedUploadImage(createSizedFile('limit.jpg', MAX_UPLOAD_FILE_SIZE_BYTES))).toBe(false);
    expect(isOversizedUploadImage(createSizedFile('over.jpg', MAX_UPLOAD_FILE_SIZE_BYTES + 1))).toBe(true);
  });

  it('names the file, its size, and the allowed limit', () => {
    expect(buildOversizedUploadMessage([createSizedFile('museum.jpg', 17 * 1024 * 1024)]))
      .toBe('“museum.jpg” is 17 MB. Choose an image that is 10 MB or smaller.');
  });

  it('translates the backend size response into actionable copy', () => {
    const error = new Error('API error (400): {"detail":"File too large. Maximum size: 10MB"}');
    expect(getArtworkUploadErrorMessage(error))
      .toBe('This image is too large. Choose an image that is 10 MB or smaller.');
  });

  it('explains empty and unreadable image failures', () => {
    expect(getArtworkUploadErrorMessage(
      new Error('API error (400): {"detail":"Uploaded file is empty"}'),
    )).toBe('This image file is empty. Choose another image.');
    expect(getArtworkUploadErrorMessage(
      new Error('API error (400): {"detail":"Invalid image file: cannot identify image file"}'),
      createSizedFile('damaged.jpg', 100),
    )).toBe('Musee couldn’t read “damaged.jpg”. Try a different JPG or PNG image.');
  });

  it('uses count-aware copy for partial and total batch failures', () => {
    const failures = [
      'Musee couldn’t upload this artwork. Check your connection and try again.',
      'Musee couldn’t upload this artwork. Check your connection and try again.',
    ];
    expect(buildBatchUploadFailureMessage(failures, 1))
      .toBe('2 artworks couldn’t be uploaded. The other selected artworks were added.');
    expect(buildBatchUploadFailureMessage(failures, 0))
      .toBe('None of the selected artworks could be uploaded. Check your connection and file sizes, then try again.');
  });
});
