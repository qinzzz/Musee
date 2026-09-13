import { resolveImageUrl } from '../../api/artworks';
import type { GalleryItem, SessionLink } from '../../types';
import type { ArtworkBootstrapCacheItem } from '../../lib/bootstrapCache';
import { parseAnalysis } from './analysisText';
import { parseServerTimestamp } from '../../lib/time';
import { buildArtworkListItem, splitArtworkListItem } from './artworkState';
import { buildSessionLink } from '../../session/lib/sessionLinks';

// Pure mappers between the three artwork representations: backend records,
// bootstrap-cache entries, and in-memory GalleryItems.

export function mapArtworkRecordToGalleryItem(item: any): GalleryItem {
  const isDeleted = Boolean(item.is_deleted || item.deleted_at);
  const imageUrl = isDeleted ? '' : resolveImageUrl(item.photo_uri);
  const thumbnailUrl = isDeleted || !item.thumbnail_uri
    ? undefined
    : resolveImageUrl(item.thumbnail_uri);
  const keywords = (item.artwork_tags || []).map((tag: any) =>
    tag.name.startsWith('#') ? tag.name.toLowerCase() : `#${tag.name.toLowerCase()}`,
  );

  const sessionLinks: SessionLink[] = Array.isArray(item.session_links)
    ? item.session_links
        .filter((link: any) => link?.session_id)
        .map((link: any) => ({
          id: link.id,
          sessionId: link.session_id,
          sequenceNumber: link.sequence_number,
          source: link.source,
          createdAt: link.created_at,
        }))
    : [];

  const analysisStatus = item.analysis_status || 'analyzed';

  return buildArtworkListItem(
    {
      id: item.id,
      clientId: item.id,
      artworkId: item.id,
      url: imageUrl,
      thumbnailUrl,
      artistName: item.artist_name,
      artworkName: item.artwork_name,
      description: parseAnalysis(item.analysis),
      keywords,
      date: item.date,
      medium: item.medium,
      timestamp: item.photo_time ? new Date(item.photo_time).getTime() : parseServerTimestamp(item.created_at),
      sessionLinks,
      location: item.location && typeof item.location === 'object' ? JSON.stringify(item.location) : item.location,
      photoTime: item.photo_time,
      captureLocationOverride: item.capture_location_override,
      captureMuseum: item.capture_museum?.id && item.capture_museum?.canonical_name
        ? {
            id: item.capture_museum.id,
            canonicalName: item.capture_museum.canonical_name,
          }
        : undefined,
      movement: item.movement,
      periodBucket: item.period_bucket,
      referenceUrls: item.reference_urls || [],
      insights: item.insights || [],
      artistEntityId: item.artist_entity_id || undefined,
      classification: item.classification || 'unsorted',
      conversation: [],
      sessionCapturedAt: item.created_at
        ? parseServerTimestamp(item.created_at)
        : (item.photo_time ? new Date(item.photo_time).getTime() : Date.now()),
      vibe: {
        backgroundColor: '#ffffff',
        padding: 4,
        borderRadius: '12px',
        borderType: 'solid',
        accentColor: '#000000',
      },
    },
    {
      analysisStatus,
      analysisError: item.analysis_error || undefined,
      syncStatus: 'synced',
      isAnalyzing: analysisStatus === 'pending' || analysisStatus === 'analyzing',
      streamingText: analysisStatus === 'failed' ? (item.analysis_error || 'Analysis failed.') : undefined,
      isDeletedPlaceholder: isDeleted || undefined,
    },
  );
}

export function mapCachedArtworkToGalleryItem(item: ArtworkBootstrapCacheItem): GalleryItem {
  const sessionLinks = item.sessionLinks || buildSessionLink(
    item.sessionId,
    undefined,
    undefined,
  );

  return buildArtworkListItem(
    {
      id: item.id,
      clientId: item.clientId,
      artworkId: item.artworkId,
      url: item.url,
      thumbnailUrl: item.thumbnailUrl,
      artistName: item.artistName,
      artworkName: item.artworkName,
      description: item.description,
      keywords: item.keywords,
      date: item.date,
      medium: item.medium,
      timestamp: item.timestamp,
      sessionCapturedAt: item.sessionCapturedAt,
      conversation: [],
      sessionLinks,
      location: item.location,
      photoTime: item.photoTime,
      captureLocationOverride: item.captureLocationOverride,
      captureMuseum: item.captureMuseum,
      movement: item.movement,
      periodBucket: item.periodBucket,
      referenceUrls: item.referenceUrls,
      insights: item.insights,
      artistEntityId: item.artistEntityId,
      classification: item.classification,
      vibe: {
        backgroundColor: '#ffffff',
        padding: 4,
        borderRadius: '12px',
        borderType: 'solid',
        accentColor: '#000000',
      },
    },
    {
      analysisStatus: item.analysisStatus,
      analysisError: item.analysisError,
      syncStatus: 'synced',
      isAnalyzing: item.analysisStatus === 'pending' || item.analysisStatus === 'analyzing',
      streamingText: item.analysisStatus === 'failed' ? (item.analysisError || 'Analysis failed.') : undefined,
    },
  );
}

export function mapGalleryItemToCacheItem(item: GalleryItem): ArtworkBootstrapCacheItem {
  const { record, clientState } = splitArtworkListItem(item);
  return {
    id: record.id,
    clientId: record.clientId,
    artworkId: record.artworkId,
    url: record.url,
    artistName: record.artistName,
    artworkName: record.artworkName,
    description: record.description,
    keywords: record.keywords,
    date: record.date,
    medium: record.medium,
    timestamp: record.timestamp,
    sessionCapturedAt: record.sessionCapturedAt,
    sessionLinks: record.sessionLinks,
    location: typeof record.location === 'string' ? record.location : undefined,
    photoTime: record.photoTime,
    captureLocationOverride: record.captureLocationOverride,
    captureMuseum: record.captureMuseum,
    movement: record.movement,
    periodBucket: record.periodBucket,
    referenceUrls: record.referenceUrls,
    insights: record.insights,
    artistEntityId: record.artistEntityId,
    classification: record.classification,
    analysisStatus: clientState.analysisStatus,
    analysisError: clientState.analysisError,
  };
}
