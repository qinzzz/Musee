import type { SavedArtworkUploadResult } from '../../api/analysis';
import { buildArtworkListItem } from '../../artwork/lib/artworkState';
import { buildSessionLink } from '../../session/lib/sessionLinks';
import type { GalleryItem, SessionLink } from '../../types';
import type { CaptureCoordinates, IngestMode, LocationInfo } from '../types';

type BasePlaceholderOptions = {
  previewUrl: string;
  timestamp: number;
  photoTime: string;
  location?: string;
  sessionId?: string;
  sequenceNumber?: number;
  mode: IngestMode;
};

function buildSource(mode: IngestMode): SessionLink['source'] {
  return mode === 'camera' ? 'camera' : 'upload';
}

export function buildUploadLocationString(
  coords?: Partial<CaptureCoordinates>,
  resolved?: Partial<LocationInfo>,
): string | undefined {
  if (coords?.latitude === undefined || coords.longitude === undefined) {
    return undefined;
  }

  return JSON.stringify({
    latitude: coords.latitude,
    longitude: coords.longitude,
    ...(coords.accuracyMeters !== undefined ? { accuracy_meters: coords.accuracyMeters } : {}),
    ...(coords.positionTimestamp !== undefined ? { position_timestamp: coords.positionTimestamp } : {}),
    ...(coords.source ? { source: coords.source } : {}),
    city: resolved?.city ?? '',
    country: resolved?.country ?? '',
    museum: resolved?.museum ?? '',
  });
}

export function createUploadPlaceholder(options: BasePlaceholderOptions): GalleryItem {
  return buildArtworkListItem(
    {
      id: `upload-placeholder-${Math.random().toString(36).slice(2, 11)}`,
      url: options.previewUrl,
      keywords: [],
      vibe: {
        backgroundColor: '#ffffff',
        padding: 4,
        borderRadius: '12px',
        borderType: 'solid',
        accentColor: '#000000',
      },
      timestamp: options.timestamp,
      sessionCapturedAt: Date.now(),
      conversation: [],
      sessionLinks: buildSessionLink(
        options.sessionId,
        options.sequenceNumber,
        buildSource(options.mode),
      ),
      location: options.location,
      photoTime: options.photoTime,
      artistName: 'Unknown Artist',
      artworkName: 'Untitled',
    },
    {
      isAnalyzing: true,
      analysisStatus: 'pending',
      analysisError: undefined,
      syncStatus: 'pending',
    },
  );
}

export function createPersistedUploadItem(
  saved: SavedArtworkUploadResult,
  options: BasePlaceholderOptions,
): GalleryItem {
  return buildArtworkListItem(
    {
      id: saved.id,
      artworkId: saved.id,
      url: options.previewUrl,
      keywords: [],
      vibe: {
        backgroundColor: '#ffffff',
        padding: 4,
        borderRadius: '12px',
        borderType: 'solid',
        accentColor: '#000000',
      },
      timestamp: options.timestamp,
      sessionCapturedAt: Date.now(),
      conversation: [],
      sessionLinks: buildSessionLink(
        options.sessionId,
        options.sequenceNumber,
        buildSource(options.mode),
      ),
      location:
        (saved.location && typeof saved.location === 'object'
          ? JSON.stringify(saved.location)
          : saved.location) || options.location,
      photoTime: saved.photo_time || options.photoTime,
      captureMuseum: saved.capture_museum
        ? {
            id: saved.capture_museum.id,
            canonicalName: saved.capture_museum.canonical_name,
          }
        : undefined,
      artistName: saved.artist_name || 'Unknown Artist',
      artworkName: saved.artwork_name || 'Untitled',
    },
    {
      isAnalyzing: true,
      analysisStatus: 'pending',
      analysisError: undefined,
      syncStatus: 'synced',
    },
  );
}
