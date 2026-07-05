import type { PendingSessionArtwork } from '../session/types';

export type IngestMode = 'gallery' | 'camera';

export type CaptureSubmission = {
  artwork: File;
  label: File | null;
  coords?: { latitude: number; longitude: number };
};

export type ExifMetadata = {
  latitude?: number;
  longitude?: number;
  timestamp?: number;
};

export type LocationInfo = {
  city: string;
  country: string;
  museum: string;
};

export type PreparedSessionUploadEntry = Extract<PendingSessionArtwork, { kind: 'upload' }>;

export type PreparedUploadCandidate = {
  file: File;
  previewUrl: string;
  mode: IngestMode;
  timestamp: number;
  photoTime: string;
  coords?: { latitude?: number; longitude?: number };
  location?: string;
};

export type PreparedUploadSessionContext = {
  sessionId: string;
  getSequenceNumber: (entryId: string) => number;
  // The canonical persisted user_input event id for the batch.
  userInputEventId: string;
};

export type PreparedUploadIngestResult = {
  persistedItems: import('../types').GalleryItem[];
  analysisPromise: Promise<import('../types').GalleryItem[]>;
};
