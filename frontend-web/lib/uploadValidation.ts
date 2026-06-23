export const SUPPORTED_UPLOAD_ACCEPT =
  '.jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif';

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
