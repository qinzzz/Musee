import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchUserArtworks,
  resolveImageUrl,
  updateArtworkClassification,
} from '../../api/artworks';
import type { ArtworkClassification, GalleryItem, SessionLink, TagCoordinate } from '../../types';
import type { ArtworkDetailContext } from '../../lib/appNavigation';
import {
  readArtworkBootstrapCache,
  writeArtworkBootstrapCache,
  type ArtworkBootstrapCacheItem,
} from '../../lib/bootstrapCache';
import { parseAnalysis } from '../lib/analysisText';
import { parseServerTimestamp } from '../../lib/time';
import type { ArtworkDetailItem, ArtworkDetailSelection } from '../types';
import {
  buildArtworkListItem,
  resolveArtworkDetailItem,
  splitArtworkListItem,
} from '../lib/artworkState';
import { buildSessionLink, getPrimarySessionId } from '../../session/lib/sessionLinks';
import { getArtworkClientId } from '../../lib/artworkIdentity';

type UseArtworkLibraryOptions = {
  userId: string;
  showToast: (message: string, type?: 'info' | 'success') => void;
  onMissingArtworkFromHistory?: () => void;
  onArtworkDetailContextChange?: (context: ArtworkDetailContext | null) => void;
  onTagPositionsLoaded?: (updater: (prev: Record<string, TagCoordinate>) => Record<string, TagCoordinate>) => void;
};

function getServerItemKeys(item: GalleryItem): string[] {
  const keys = [item.id, getArtworkClientId(item)];
  if (item.artworkId) {
    keys.push(item.artworkId);
  }
  return keys;
}

function mergeServerItemsWithLocalItems(
  previousItems: GalleryItem[],
  serverItems: GalleryItem[],
): GalleryItem[] {
  const serverKeys = new Set(serverItems.flatMap(getServerItemKeys));

  const preservedLocalItems = previousItems.filter((item) => {
    if (!item.syncStatus || item.syncStatus === 'synced') {
      return false;
    }

    return !getServerItemKeys(item).some((key) => serverKeys.has(key));
  });

  return [...preservedLocalItems, ...serverItems];
}

function mapArtworkRecordToGalleryItem(item: any): GalleryItem {
  const imageUrl = resolveImageUrl(item.photo_uri);
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
    },
  );
}

function mapCachedArtworkToGalleryItem(item: ArtworkBootstrapCacheItem): GalleryItem {
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

function mapGalleryItemToCacheItem(item: GalleryItem): ArtworkBootstrapCacheItem {
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

function seedTagPositionsFromItems(
  items: GalleryItem[],
  onTagPositionsLoaded?: (updater: (prev: Record<string, TagCoordinate>) => Record<string, TagCoordinate>) => void,
) {
  onTagPositionsLoaded?.((prev) => {
    const next = { ...prev };
    let changed = false;
    items.forEach((item) => {
      item.keywords.forEach((tag) => {
        if (!next[tag]) {
          next[tag] = {
            x: (Math.random() * 2 - 1),
            y: (Math.random() * 2 - 1),
          };
          changed = true;
        }
      });
    });
    return changed ? next : prev;
  });
}

function resolveArtworkDetailNavigationItems(
  sourceItem: GalleryItem,
  items: GalleryItem[],
  navigationItemIds?: string[],
): GalleryItem[] {
  if (navigationItemIds && navigationItemIds.length > 0) {
    const itemsById = new Map(items.map((item) => [getArtworkClientId(item), item] as const));
    const resolved = navigationItemIds
      .map((itemId) => itemsById.get(itemId))
      .filter((item): item is GalleryItem => Boolean(item));

    if (resolved.length > 0) {
      return resolved;
    }
  }

  const primarySessionId = getPrimarySessionId(sourceItem);
  if (primarySessionId) {
    return items.filter((entry) => getPrimarySessionId(entry) === primarySessionId);
  }

  return [sourceItem];
}

export function useArtworkLibrary({
  userId,
  showToast,
  onMissingArtworkFromHistory,
  onArtworkDetailContextChange,
  onTagPositionsLoaded,
}: UseArtworkLibraryOptions) {
  const [items, setItems] = useState<GalleryItem[]>(() => {
    const cachedItems = readArtworkBootstrapCache(userId);
    return cachedItems ? cachedItems.map(mapCachedArtworkToGalleryItem) : [];
  });
  const [artworksLoaded, setArtworksLoaded] = useState(false);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [artworkDetailSelection, setArtworkDetailSelection] = useState<ArtworkDetailSelection | null>(null);
  const tagPositionsLoadedRef = useRef(onTagPositionsLoaded);

  useEffect(() => {
    tagPositionsLoadedRef.current = onTagPositionsLoaded;
  }, [onTagPositionsLoaded]);

  useEffect(() => {
    setArtworksLoaded(false);
    const cachedItems = readArtworkBootstrapCache(userId);
    if (cachedItems) {
      const hydratedItems = cachedItems.map(mapCachedArtworkToGalleryItem);
      setItems(hydratedItems);
      seedTagPositionsFromItems(hydratedItems, tagPositionsLoadedRef.current);
    } else {
      setItems([]);
    }

    const loadArtworks = async () => {
      try {
        const data = await fetchUserArtworks(userId);

        if (!data?.items) {
          setArtworksLoaded(true);
          return;
        }

        const mappedItems: GalleryItem[] = data.items.map(mapArtworkRecordToGalleryItem);

        setItems((previousItems) => mergeServerItemsWithLocalItems(previousItems, mappedItems));
        seedTagPositionsFromItems(mappedItems, tagPositionsLoadedRef.current);
      } catch (error) {
        console.error('Failed to load previous artworks:', error);
      } finally {
        setArtworksLoaded(true);
      }
    };

    void loadArtworks();
  }, [userId]);

  useEffect(() => {
    const cacheableItems = items
      .filter((item) => !item.isDeletedPlaceholder && (!item.syncStatus || item.syncStatus === 'synced'))
      .map(mapGalleryItemToCacheItem);

    writeArtworkBootstrapCache(userId, cacheableItems);
  }, [items, userId]);

  const artworkDetailItem = useMemo<ArtworkDetailItem | null>(() => {
    return resolveArtworkDetailItem(
      items,
      artworkDetailSelection,
      resolveArtworkDetailNavigationItems,
    );
  }, [artworkDetailSelection, items]);

  const buildArtworkDetailSelection = (item: GalleryItem, allItems?: GalleryItem[]): ArtworkDetailSelection => ({
    artworkClientId: getArtworkClientId(item),
    navigationItemClientIds: allItems?.map((entry) => getArtworkClientId(entry)),
  });

  const restoreArtworkFromHistory = (artworkId: string, context: ArtworkDetailContext) => {
    const sourceItem = items.find((item) => getArtworkClientId(item) === artworkId || item.id === artworkId || item.artworkId === artworkId);
    if (!sourceItem) {
      setArtworkDetailSelection(null);
      onArtworkDetailContextChange?.(null);
      onMissingArtworkFromHistory?.();
      return;
    }
    onArtworkDetailContextChange?.(context);
    setArtworkDetailSelection(buildArtworkDetailSelection(sourceItem));
  };

  const handleUpdateClassification = async (itemId: string, classification: ArtworkClassification) => {
    const previous = items.find((item) => item.id === itemId)?.classification || 'unsorted';
    if (previous === classification) return;
    const targetItem = items.find((item) => item.id === itemId);
    const backendArtworkId = targetItem?.artworkId || targetItem?.id;
    if (!backendArtworkId) return;

    setItems((prev) => prev.map((item) => item.id === itemId ? { ...item, classification } : item));
    setProfileRefreshKey((prev) => prev + 1);

    try {
      await updateArtworkClassification(backendArtworkId, classification);
    } catch (error) {
      console.error('Failed to update artwork classification:', error);
      setItems((prev) => prev.map((item) => item.id === itemId ? { ...item, classification: previous } : item));
      setProfileRefreshKey((prev) => prev + 1);
      showToast('Could not update artwork classification', 'info');
      throw error;
    }
  };

  const updateItemMetadata = (
    id: string,
    updates: {
      artistName?: string;
      artworkName?: string;
      date?: string;
      medium?: string;
      keywords?: string[];
    },
  ) => {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, ...updates } : item));
  };

  return {
    items,
    setItems,
    artworksLoaded,
    profileRefreshKey,
    artworkDetailItem,
    artworkDetailSelection,
    setArtworkDetailSelection,
    buildArtworkDetailSelection,
    restoreArtworkFromHistory,
    handleUpdateClassification,
    updateItemMetadata,
  };
}
