import { useEffect, useMemo, useRef, useState } from 'react';
import { updateArtworkClassification } from '../../api/artworks';
import type { ArtworkClassification, GalleryItem, TagCoordinate } from '../../types';
import type { ArtworkDetailContext } from '../../lib/appNavigation';
import {
  readArtworkBootstrapCache,
  writeArtworkBootstrapCache,
} from '../../lib/bootstrapCache';
import type { ArtworkDetailItem, ArtworkDetailSelection } from '../types';
import { resolveArtworkDetailItem } from '../lib/artworkState';
import {
  mapCachedArtworkToGalleryItem,
  mapGalleryItemToCacheItem,
} from '../lib/artworkMapping';
import { useArtworksQuery } from './useArtworksQuery';
import { getPrimarySessionId } from '../../session/lib/sessionLinks';
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
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [artworkDetailSelection, setArtworkDetailSelection] = useState<ArtworkDetailSelection | null>(null);
  const tagPositionsLoadedRef = useRef(onTagPositionsLoaded);

  const { serverItems, artworksLoaded, artworksError } = useArtworksQuery(userId);

  useEffect(() => {
    tagPositionsLoadedRef.current = onTagPositionsLoaded;
  }, [onTagPositionsLoaded]);

  useEffect(() => {
    // Bootstrap paint on user change; the query fetch (keyed by userId)
    // replaces it via the reconcile effect below.
    const cachedItems = readArtworkBootstrapCache(userId);
    if (cachedItems) {
      const hydratedItems = cachedItems.map(mapCachedArtworkToGalleryItem);
      setItems(hydratedItems);
      seedTagPositionsFromItems(hydratedItems, tagPositionsLoadedRef.current);
    } else {
      setItems([]);
    }
  }, [userId]);

  useEffect(() => {
    // Reconciliation: the backend is canonical — fetched items replace all
    // synced items wholesale; only the unsynced local overlay survives
    // (mergeServerItemsWithLocalItems). Same rule as session events.
    if (!serverItems) return;
    setItems((previousItems) => mergeServerItemsWithLocalItems(previousItems, serverItems));
    seedTagPositionsFromItems(serverItems, tagPositionsLoadedRef.current);
  }, [serverItems]);

  useEffect(() => {
    if (artworksError) {
      console.error('Failed to load previous artworks:', artworksError);
    }
  }, [artworksError]);

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
