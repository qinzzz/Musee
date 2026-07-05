import { createUploadPlaceholder } from './placeholders';
import type {
  IngestMode,
  PreparedSessionUploadEntry,
  PreparedUploadCandidate,
} from '../types';
import type { PendingSessionArtwork, SessionStreamMessage } from '../../session/types';
import { newSessionEventId } from '../../session/lib/sessionLinks';
import { nextLocalOrder } from '../../session/lib/sessionOrdering';
import type { GalleryItem } from '../../types';

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
    id: `upload-${Math.random().toString(36).substring(2, 11)}`,
    kind: 'upload',
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

export function buildArtworkInputEvent(
  artworkIds: string[],
  options: {
    mode: IngestMode;
    history: SessionStreamMessage[];
    eventId?: string;
  },
): SessionStreamMessage {
  const eventId = options.eventId || newSessionEventId();
  const source = options.mode === 'camera' ? 'capture' : 'upload';
  return {
    id: eventId,
    role: 'user',
    text: '',
    type: 'text',
    artworkIds,
    createdAt: getNextLocalSessionEventCreatedAt(options.history),
    localOrder: nextLocalOrder(),
    payload: {
      artworks: artworkIds.map((artworkId) => ({
        artwork_id: artworkId,
        source,
      })),
    },
  };
}

export function buildPreparedUploadDisplayEvents(
  placeholderId: string,
  artworkId: string,
  parentEventId: string,
): SessionStreamMessage[] {
  const createdAt = Date.now();
  return [
    {
      id: `capture-${placeholderId}`,
      role: 'user',
      text: '',
      type: 'artwork_capture',
      artworkId,
      triggerEventId: parentEventId,
      createdAt,
      localOrder: nextLocalOrder(),
    },
    {
      id: `card-${placeholderId}`,
      role: 'model',
      text: '',
      type: 'artwork_card',
      artworkId,
      triggerEventId: parentEventId,
      createdAt: createdAt + 1,
      localOrder: nextLocalOrder(),
    },
  ];
}

export function buildPersistedSessionArtworkEntries(
  items: GalleryItem[],
  sessionId: string,
): Array<{ artworkId: string; source: 'upload' | 'capture' | 'library' }> {
  return items
    .map((item) => {
      const link = item.sessionLinks?.find((sessionLink) => sessionLink.sessionId === sessionId);
      const source: 'upload' | 'capture' | 'library' = link?.source === 'library'
        ? 'library'
        : link?.source === 'camera'
          ? 'capture'
          : 'upload';
      return { artworkId: item.artworkId!, source };
    })
    .filter((entry) => entry.artworkId);
}
