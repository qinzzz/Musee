import type { SavedArtworkUploadResult } from '../../api/analysis';
import { buildSessionLink } from '../../session/lib/sessionLinks';
import type { GalleryItem, SessionLink } from '../../types';
import type { IngestMode, LocationInfo } from '../types';

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
  coords?: { latitude?: number; longitude?: number },
  resolved?: Partial<LocationInfo>,
): string | undefined {
  if (coords?.latitude === undefined || coords.longitude === undefined) {
    return undefined;
  }

  return JSON.stringify({
    latitude: coords.latitude,
    longitude: coords.longitude,
    city: resolved?.city ?? '',
    country: resolved?.country ?? '',
    museum: resolved?.museum ?? '',
  });
}

export function createUploadPlaceholder(options: BasePlaceholderOptions): GalleryItem {
  return {
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
    isAnalyzing: true,
    analysisStatus: 'pending',
    analysisError: undefined,
    syncStatus: 'pending',
    location: options.location,
    photoTime: options.photoTime,
    artistName: 'Unknown Artist',
    artworkName: 'Untitled',
  };
}

export function createPersistedUploadItem(
  saved: SavedArtworkUploadResult,
  options: BasePlaceholderOptions,
): GalleryItem {
  return {
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
    isAnalyzing: true,
    analysisStatus: 'pending',
    analysisError: undefined,
    syncStatus: 'synced',
    location:
      (saved.location && typeof saved.location === 'object'
        ? JSON.stringify(saved.location)
        : saved.location) || options.location,
    photoTime: saved.photo_time || options.photoTime,
    artistName: saved.artist_name || 'Unknown Artist',
    artworkName: saved.artwork_name || 'Untitled',
  };
}
