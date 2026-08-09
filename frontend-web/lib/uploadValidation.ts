export const SUPPORTED_UPLOAD_ACCEPT =
  '.jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif';

// Keep this aligned with backend Settings.max_file_size_mb. The backend
// remains authoritative; this limit prevents predictable rejected requests.
export const MAX_UPLOAD_FILE_SIZE_MB = 10;
export const MAX_UPLOAD_FILE_SIZE_BYTES = MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024;

const GENERIC_UPLOAD_ERROR = 'Musee couldn’t upload this artwork. Check your connection and try again.';
const UPLOAD_TIMEOUT_ERROR = 'The upload took too long. Check your connection and try again.';
const GENERIC_ANALYSIS_ERROR = 'Artwork saved, but Musee couldn’t analyze it. Try identifying it again.';
const ANALYSIS_TIMEOUT_ERROR = 'Artwork saved, but analysis took too long. Try identifying it again.';

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'heif',
]);

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/x-heic',
  'image/x-heif',
]);

function getFileExtension(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() || '';
}

export function isSupportedUploadImage(file: File): boolean {
  const extension = getFileExtension(file);
  const mimeType = file.type.toLowerCase();

  if (SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
    return true;
  }

  if (mimeType && SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    return true;
  }

  return false;
}

export function buildUnsupportedUploadMessage(invalidFiles: File[]): string {
  if (invalidFiles.length === 1) {
    return `"${invalidFiles[0].name}" is not a supported image format. Upload a JPG, PNG, WebP, or HEIC/HEIF image instead.`;
  }

  return `Skipped ${invalidFiles.length} unsupported files. Musee currently supports JPG, PNG, WebP, and HEIC/HEIF images.`;
}

export function isOversizedUploadImage(file: File): boolean {
  return file.size > MAX_UPLOAD_FILE_SIZE_BYTES;
}

export function formatUploadFileSize(file: File): string {
  const sizeMb = file.size / (1024 * 1024);
  return `${sizeMb >= 10 ? Math.round(sizeMb) : sizeMb.toFixed(1)} MB`;
}

export function buildOversizedUploadMessage(files: File[]): string {
  if (files.length === 1) {
    const [file] = files;
    return `“${file.name}” is ${formatUploadFileSize(file)}. Choose an image that is ${MAX_UPLOAD_FILE_SIZE_MB} MB or smaller.`;
  }

  const names = files.slice(0, 3).map((file) => `“${file.name}”`).join(', ');
  const remaining = files.length - 3;
  const nameSummary = remaining > 0 ? `${names}, and ${remaining} more` : names;
  return `Skipped ${files.length} images larger than ${MAX_UPLOAD_FILE_SIZE_MB} MB: ${nameSummary}. Choose smaller images to continue.`;
}

export function buildUnpreparedUploadMessage(files: File[]): string {
  if (files.length === 1) {
    return `Musee couldn’t prepare “${files[0].name}”. Try a JPG or PNG version instead.`;
  }
  return `Musee couldn’t prepare ${files.length} images. Try JPG or PNG versions instead.`;
}

function extractBackendDetail(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const jsonStart = error.message.indexOf('{');
  if (jsonStart === -1) return null;
  try {
    const body = JSON.parse(error.message.slice(jsonStart));
    const detail = body?.detail ?? body;
    return typeof detail === 'string' ? detail : null;
  } catch {
    return null;
  }
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function getArtworkUploadErrorMessage(error: unknown, file?: File): string {
  const backendDetail = extractBackendDetail(error);
  const normalizedDetail = backendDetail?.toLowerCase();
  if (normalizedDetail?.includes('file too large') || (error instanceof Error && error.message.includes('API error (413)'))) {
    return file
      ? buildOversizedUploadMessage([file])
      : `This image is too large. Choose an image that is ${MAX_UPLOAD_FILE_SIZE_MB} MB or smaller.`;
  }
  if (normalizedDetail?.includes('invalid file type')) {
    return file
      ? buildUnsupportedUploadMessage([file])
      : 'This file is not a supported image. Upload a JPG, PNG, WebP, or HEIC/HEIF image instead.';
  }
  if (normalizedDetail?.includes('file is empty')) {
    return 'This image file is empty. Choose another image.';
  }
  if (normalizedDetail?.includes('invalid image file')) {
    return file
      ? `Musee couldn’t read “${file.name}”. Try a different JPG or PNG image.`
      : 'Musee couldn’t read this image. Try a different JPG or PNG image.';
  }
  return isTimeoutError(error) ? UPLOAD_TIMEOUT_ERROR : GENERIC_UPLOAD_ERROR;
}

export function getArtworkAnalysisErrorMessage(error: unknown): string {
  return isTimeoutError(error) ? ANALYSIS_TIMEOUT_ERROR : GENERIC_ANALYSIS_ERROR;
}

export function buildBatchUploadFailureMessage(
  failureMessages: string[],
  successfulCount: number,
): string | null {
  if (failureMessages.length === 0) return null;
  if (failureMessages.length === 1) {
    return successfulCount > 0
      ? `${failureMessages[0]} The other selected artworks were added.`
      : failureMessages[0];
  }
  return successfulCount > 0
    ? `${failureMessages.length} artworks couldn’t be uploaded. The other selected artworks were added.`
    : 'None of the selected artworks could be uploaded. Check your connection and file sizes, then try again.';
}
