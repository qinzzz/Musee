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

export type PreparedUploadSessionContext = {
  sessionId: string;
  getSequenceNumber: (entryId: string) => number;
};
