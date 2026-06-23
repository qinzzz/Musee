import ExifReader from 'exifreader';
import type { ExifMetadata, IngestMode } from '../types';

const BACKEND_UNSUPPORTED_EXTENSIONS = new Set(['heic', 'heif']);

function isBackendUnsupportedImage(file: File): boolean {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const mimeType = file.type.toLowerCase();
  return BACKEND_UNSUPPORTED_EXTENSIONS.has(extension) || mimeType.includes('heic') || mimeType.includes('heif');
}

async function transcodeImageToJpeg(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode image for upload.'));
      img.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not prepare image for upload.');
    }

    context.drawImage(image, 0, 0);

    const jpegBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Could not convert image to JPEG.'));
        }
      }, 'image/jpeg', 0.92);
    });

    const baseName = file.name.replace(/\.[^/.]+$/, '') || 'camera-capture';
    return new File([jpegBlob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function normalizeUploadFile(file: File): Promise<File> {
  if (!isBackendUnsupportedImage(file)) {
    return file;
  }
  return transcodeImageToJpeg(file);
}

export async function readExifMetadata(file: File): Promise<ExifMetadata> {
  try {
    const tags = await ExifReader.load(file, { expanded: true });
    const lat = tags.gps?.Latitude;
    const lon = tags.gps?.Longitude;
    const exif = tags.exif as {
      DateTimeOriginal?: { description?: string };
      CreateDate?: { description?: string };
      DateTime?: { description?: string };
    } | undefined;
    const dt =
      exif?.DateTimeOriginal?.description ||
      exif?.CreateDate?.description ||
      exif?.DateTime?.description;

    let timestamp: number | undefined;
    if (dt) {
      const parts = dt.split(' ');
      if (parts.length === 2) {
        const datePart = parts[0].replace(/:/g, '-');
        const timePart = parts[1];
        const parsed = new Date(`${datePart}T${timePart}`);
        if (!Number.isNaN(parsed.getTime())) {
          timestamp = parsed.getTime();
        }
      }
    }

    return {
      latitude: typeof lat === 'number' ? lat : undefined,
      longitude: typeof lon === 'number' ? lon : undefined,
      timestamp,
    };
  } catch {
    return { latitude: undefined, longitude: undefined, timestamp: undefined };
  }
}

export async function readExifGps(file: File): Promise<{ latitude: number; longitude: number } | undefined> {
  const meta = await readExifMetadata(file);
  if (meta.latitude !== undefined && meta.longitude !== undefined) {
    return { latitude: meta.latitude, longitude: meta.longitude };
  }
  return undefined;
}

export function formatPhotoTime(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function buildUploadRequestKey(
  files: File[],
  mode: IngestMode,
  options?: { labelFile?: File | null },
): string {
  const fileParts = files
    .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
    .sort()
    .join('|');
  const labelPart = options?.labelFile
    ? `|label:${options.labelFile.name}:${options.labelFile.size}:${options.labelFile.lastModified}`
    : '';
  return `${mode}:${fileParts}${labelPart}`;
}
