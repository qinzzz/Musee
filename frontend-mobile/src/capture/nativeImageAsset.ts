import type { NativeImageAsset } from './types';

export const MAX_ARTWORK_UPLOAD_SIZE_MB = 10;
export const MAX_ARTWORK_UPLOAD_SIZE_BYTES = MAX_ARTWORK_UPLOAD_SIZE_MB * 1024 * 1024;

const SUPPORTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const DEFAULT_MIME_TYPE = 'image/jpeg';

export type PickedImage = {
  uri: string;
  fileName?: string | null;
  fileSize?: number;
  width: number;
  height: number;
  mimeType?: string | null;
};

export class NativeImageValidationError extends Error {
  readonly code: 'unsupported_type' | 'file_too_large';

  constructor(code: NativeImageValidationError['code'], message: string) {
    super(message);
    this.name = 'NativeImageValidationError';
    this.code = code;
  }
}

function extensionOf(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function fallbackFileName(mimeType: string): string {
  return `artwork.${MIME_EXTENSION[mimeType] ?? 'jpg'}`;
}

export function createLibraryImageAsset(image: PickedImage): NativeImageAsset {
  const mimeType = image.mimeType?.toLowerCase() || DEFAULT_MIME_TYPE;
  const fileName = image.fileName || fallbackFileName(mimeType);
  const extension = extensionOf(fileName);

  if (!SUPPORTED_MIME_TYPES.has(mimeType) && !SUPPORTED_EXTENSIONS.has(extension)) {
    throw new NativeImageValidationError(
      'unsupported_type',
      'Choose a JPEG, PNG, or WebP image.',
    );
  }
  if (image.fileSize !== undefined && image.fileSize > MAX_ARTWORK_UPLOAD_SIZE_BYTES) {
    throw new NativeImageValidationError(
      'file_too_large',
      `Choose an image smaller than ${MAX_ARTWORK_UPLOAD_SIZE_MB} MB.`,
    );
  }

  return {
    uri: image.uri,
    fileName,
    mimeType,
    fileSize: image.fileSize,
    width: image.width,
    height: image.height,
    source: 'library',
  };
}
