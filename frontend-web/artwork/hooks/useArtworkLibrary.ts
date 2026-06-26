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
import type { ArtworkDetailSelection, InterpretingItem } from '../types';
import { buildSessionLink, getPrimarySessionId } from '../../session/lib/sessionLinks';

type UseArtworkLibraryOptions = {
  userId: string;
  showToast: (message: string, type?: 'info' | 'success') => void;
  onMissingArtworkFromHistory?: () => void;
  onArtworkDetailContextChange?: (context: ArtworkDetailContext | null) => void;
  onTagPositionsLoaded?: (updater: (prev: Record<string, TagCoordinate>) => Record<string, TagCoordinate>) => void;
};

function getServerItemKeys(item: GalleryItem): string[] {
  const keys = [item.id];
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

  return {
    id: item.id,
    artworkId: item.id,
    url: imageUrl,
    artistName: item.artist_name,
    artworkName: item.artwork_name,
    description: parseAnalysis(item.analysis),
    keywords,
    date: item.date,
    medium: item.medium,
    timestamp: item.photo_time ? new Date(item.photo_time).getTime() : (item.created_at ? new Date(item.created_at).getTime() : Date.now()),
    sessionLinks,
    location: item.location && typeof item.location === 'object' ? JSON.stringify(item.location) : item.location,
    photoTime: item.photo_time,
    movement: item.movement,
    periodBucket: item.period_bucket,
    referenceUrls: item.reference_urls || [],
    insights: item.insights || [],
    artistEntityId: item.artist_entity_id || undefined,
    classification: item.classification || 'unsorted',
    analysisStatus,
    analysisError: item.analysis_error || undefined,
    syncStatus: 'synced',
    isAnalyzing: analysisStatus === 'pending' || analysisStatus === 'analyzing',
    streamingText: analysisStatus === 'failed' ? (item.analysis_error || 'Analysis failed.') : undefined,
    conversation: [],
    sessionCapturedAt: item.created_at
      ? new Date(item.created_at).getTime()
      : (item.photo_time ? new Date(item.photo_time).getTime() : Date.now()),
    vibe: {
      backgroundColor: '#ffffff',
      padding: 4,
      borderRadius: '12px',
      borderType: 'solid',
      accentColor: '#000000',
    },
  };
}

function mapCachedArtworkToGalleryItem(item: ArtworkBootstrapCacheItem): GalleryItem {
  const sessionLinks = item.sessionLinks || buildSessionLink(
    item.sessionId,
    undefined,
    undefined,
  );

  return {
    id: item.id,
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
    analysisStatus: item.analysisStatus,
    analysisError: item.analysisError,
    syncStatus: 'synced',
    isAnalyzing: item.analysisStatus === 'pending' || item.analysisStatus === 'analyzing',
    streamingText: item.analysisStatus === 'failed' ? (item.analysisError || 'Analysis failed.') : undefined,
    vibe: {
      backgroundColor: '#ffffff',
      padding: 4,
      borderRadius: '12px',
      borderType: 'solid',
      accentColor: '#000000',
    },
  };
}

function mapGalleryItemToCacheItem(item: GalleryItem): ArtworkBootstrapCacheItem {
  return {
    id: item.id,
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
    sessionLinks: item.sessionLinks,
    location: typeof item.location === 'string' ? item.location : undefined,
    photoTime: item.photoTime,
    movement: item.movement,
    periodBucket: item.periodBucket,
    referenceUrls: item.referenceUrls,
    insights: item.insights,
    artistEntityId: item.artistEntityId,
    classification: item.classification,
    analysisStatus: item.analysisStatus,
    analysisError: item.analysisError,
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

function resolveInterpretingNavigationItems(
  sourceItem: GalleryItem,
  items: GalleryItem[],
  navigationItemIds?: string[],
): GalleryItem[] {
  if (navigationItemIds && navigationItemIds.length > 0) {
    const itemsById = new Map(items.map((item) => [item.id, item] as const));
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

  const interpretingItem = useMemo<InterpretingItem | null>(() => {
    if (!artworkDetailSelection) return null;

    const sourceItem = items.find((item) => (
      item.id === artworkDetailSelection.artworkId || item.artworkId === artworkDetailSelection.artworkId
    ));

    if (!sourceItem) return null;

    return {
      ...sourceItem,
      navigationItems: resolveInterpretingNavigationItems(
        sourceItem,
        items,
        artworkDetailSelection.navigationItemIds,
      ),
      is_liked: artworkDetailSelection.is_liked,
    };
  }, [artworkDetailSelection, items]);

  const buildArtworkDetailSelection = (item: GalleryItem, allItems?: GalleryItem[]): ArtworkDetailSelection => ({
    artworkId: item.id,
    navigationItemIds: allItems?.map((entry) => entry.id),
  });

  const restoreArtworkFromHistory = (artworkId: string, context: ArtworkDetailContext) => {
    const sourceItem = items.find((item) => item.id === artworkId || item.artworkId === artworkId);
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

    setItems((prev) => prev.map((item) => item.id === itemId ? { ...item, classification } : item));
    setProfileRefreshKey((prev) => prev + 1);

    try {
      await updateArtworkClassification(itemId, classification);
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
    interpretingItem,
    artworkDetailSelection,
    setArtworkDetailSelection,
    buildArtworkDetailSelection,
    restoreArtworkFromHistory,
    handleUpdateClassification,
    updateItemMetadata,
  };
}
