import type { PendingSessionArtwork } from '../session/types';
import type { ArtworkUploadFailureCode } from '../lib/uploadValidation';

export type IngestMode = 'gallery' | 'camera';

export type CaptureCoordinates = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  positionTimestamp?: number;
  source?: 'device_live' | 'image_exif';
};

export type CaptureSubmission = {
  artwork: File;
  label: File | null;
  coords?: CaptureCoordinates;
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
  coords?: Partial<CaptureCoordinates>;
  location?: string;
};

export type PreparedUploadSessionContext = {
  sessionId: string;
  getSequenceNumber: (entryId: string) => number;
  // Called synchronously before placeholders enter gallery state. Session
  // orchestration uses this to bind them to one stable optimistic input block,
  // so they can never render as legacy/orphan artwork rows.
  onPlaceholdersReady?: (placeholders: Array<{
    entryId: string;
    item: import('../types').GalleryItem;
  }>) => void;
};

export type PreparedUploadIngestResult = {
  persistedItems: import('../types').GalleryItem[];
  persistedEntries: Array<{
    entryId: string;
    item: import('../types').GalleryItem;
  }>;
  failedEntries: Array<{
    entryId: string;
    message: string;
    errorCode?: ArtworkUploadFailureCode;
  }>;
  analysisPromise: Promise<import('../types').GalleryItem[]>;
  analysisFailureCountPromise?: Promise<number>;
};
