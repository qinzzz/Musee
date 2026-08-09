import { createUploadPlaceholder } from './placeholders';
import type {
  IngestMode,
  PreparedSessionUploadEntry,
  PreparedUploadCandidate,
} from '../types';
import type { PendingSessionArtwork, SessionStreamMessage } from '../../session/types';
import type { GalleryItem } from '../../types';

function newUploadOperationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `upload-${crypto.randomUUID()}`;
  }
  return `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function getNextLocalSessionEventCreatedAt(messages: SessionStreamMessage[]): number {
  const lastCreatedAt = messages.reduce((max, message) => Math.max(max, message.createdAt || 0), 0);
  return Math.max(Date.now(), lastCreatedAt + 1);
}

export function getNextSessionArtworkSequenceNumber(items: GalleryItem[], sessionId: string): number {
  const maxSequenceNumber = items.reduce((max, item) => {
    const link = item.sessionLinks?.find((sessionLink) => sessionLink.sessionId === sessionId);
    return typeof link?.sequenceNumber === 'number'
      ? Math.max(max, link.sequenceNumber)
      : max;
  }, -1);
  return maxSequenceNumber + 1;
}

export async function prepareUploadCandidates(
  files: File[],
  mode: IngestMode,
  options: {
    captureCoords?: { latitude: number; longitude: number } | null;
    readExifMetadata: (file: File) => Promise<{ latitude?: number; longitude?: number; timestamp?: number }>;
    formatPhotoTime: (timestamp: number) => string;
    buildUploadLocationString: (coords?: { latitude?: number; longitude?: number }) => string | undefined;
  },
): Promise<PreparedUploadCandidate[]> {
  return Promise.all(files.map(async (file) => {
    const metadata = mode === 'gallery'
      ? await options.readExifMetadata(file)
      : { latitude: undefined, longitude: undefined, timestamp: undefined };
    const coords = {
      latitude: options.captureCoords?.latitude ?? metadata.latitude,
      longitude: options.captureCoords?.longitude ?? metadata.longitude,
    };
    const timestamp = metadata.timestamp || Date.now();

    return {
      uploadOperationId: newUploadOperationId(),
      file,
      previewUrl: await readFileAsDataUrl(file),
      mode,
      timestamp,
      photoTime: options.formatPhotoTime(timestamp),
      coords,
      location: options.buildUploadLocationString(coords),
    };
  }));
}

export function buildStagedPendingUploads(candidates: PreparedUploadCandidate[]): PreparedSessionUploadEntry[] {
  return candidates.map((candidate) => ({
    id: candidate.uploadOperationId,
    kind: 'upload',
    uploadOperationId: candidate.uploadOperationId,
    file: candidate.file,
    previewUrl: candidate.previewUrl,
    mode: candidate.mode,
    timestamp: candidate.timestamp,
    photoTime: candidate.photoTime,
    coords: candidate.coords,
    location: candidate.location,
    label: candidate.file.name.replace(/\.[^/.]+$/, '') || 'New upload',
    sublabel: candidate.mode === 'camera' ? 'Camera capture' : candidate.photoTime,
  }));
}

export function buildUploadPlaceholders(
  candidates: PreparedUploadCandidate[],
  options: {
    sessionId?: string;
    startingSequenceNumber?: number;
  },
): GalleryItem[] {
  return candidates.map((candidate, index) => createUploadPlaceholder({
    previewUrl: candidate.previewUrl,
    mode: candidate.mode,
    timestamp: candidate.timestamp,
    photoTime: candidate.photoTime,
    location: candidate.location,
    sessionId: options.sessionId,
    sequenceNumber: options.startingSequenceNumber === undefined
      ? undefined
      : options.startingSequenceNumber + index,
  }));
}
