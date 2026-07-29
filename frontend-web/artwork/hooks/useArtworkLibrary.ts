import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { updateArtworkClassification } from '../../api/artworks';
import type { ArtworkClassification, GalleryItem, SessionLink, TagCoordinate } from '../../types';
import type { ArtworkDetailContext } from '../../lib/appNavigation';
import {
  readArtworkBootstrapCache,
  writeArtworkBootstrapCache,
} from '../../lib/bootstrapCache';
import type { ArtworkDetailItem, ArtworkDetailSelection } from '../types';
import { resolveArtworkDetailItem, updateArtworkInList, type ArtworkStatePatch } from '../lib/artworkState';
import {
  mapCachedArtworkToGalleryItem,
  mapGalleryItemToCacheItem,
} from '../lib/artworkMapping';
import { useArtworksQuery } from './useArtworksQuery';
import { getPrimarySessionId, updateSessionLinkForItem } from '../../session/lib/sessionLinks';
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

// Transient client state a refetch must not clobber: an in-flight delete, and
// live streaming text (richer than the server's coarse analyzing status). A
// terminal server analysis state (analyzed/failed) always wins.
function preserveTransientClientState(
  previous: GalleryItem | undefined,
  serverItem: GalleryItem,
): GalleryItem {
  if (!previous) return serverItem;
  const patch: Partial<GalleryItem> = {};
  // Client identity is stable across the local->server transition; UI
  // references (detail selection, navigation) must survive a refetch.
  if (previous.clientId && previous.clientId !== serverItem.clientId) {
    patch.clientId = previous.clientId;
  }
  if (previous.deleteStatus) {
    patch.deleteStatus = previous.deleteStatus;
  }
  const serverIsTerminal = serverItem.analysisStatus === 'analyzed' || serverItem.analysisStatus === 'failed';
  if (!serverIsTerminal && previous.isAnalyzing && previous.streamingText) {
    patch.isAnalyzing = true;
    patch.streamingText = previous.streamingText;
  }
  return Object.keys(patch).length ? { ...serverItem, ...patch } : serverItem;
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

  const previousByKey = new Map<string, GalleryItem>();
  previousItems.forEach((item) => {
    getServerItemKeys(item).forEach((key) => previousByKey.set(key, item));
  });
  const reconciledServerItems = serverItems.map((serverItem) => {
    const previous = getServerItemKeys(serverItem)
      .map((key) => previousByKey.get(key))
      .find(Boolean);
    return preserveTransientClientState(previous, serverItem);
  });

  return [...preservedLocalItems, ...reconciledServerItems];
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

  const {
    serverItems,
    artworksLoaded,
    artworksAuthoritative,
    artworksError,
    refreshArtworks,
    refreshArtworksIfStale,
  } = useArtworksQuery(userId);

  // The narrow write API for artwork state. Everything outside this hook goes
  // through these intent mutators (or the handlers below) instead of a raw
  // setItems, so the record/client-state invariants hold structurally.
  const patchArtwork = useCallback((targetId: string, patch: ArtworkStatePatch) => {
    setItems((prev) => updateArtworkInList(prev, targetId, patch));
  }, []);

  const addLocalArtworks = useCallback((newItems: GalleryItem[]) => {
    setItems((prev) => [...newItems, ...prev]);
  }, []);

  const replaceArtwork = useCallback((targetId: string, next: GalleryItem) => {
    setItems((prev) => prev.map((item) => (item.id === targetId ? next : item)));
  }, []);

  const removeArtwork = useCallback((targetId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== targetId));
  }, []);

  // resolveLink returns a link to set, null to detach, or undefined to skip.
  const updateArtworkSessionLinks = useCallback((
    sessionId: string,
    resolveLink: (item: GalleryItem) => SessionLink | null | undefined,
  ) => {
    setItems((prev) => prev.map((item) => {
      const decision = resolveLink(item);
      if (decision === undefined) return item;
      return updateSessionLinkForItem(item, sessionId, () => decision);
    }));
  }, []);

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
      refreshArtworks();
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
    patchArtwork,
    addLocalArtworks,
    replaceArtwork,
    removeArtwork,
    updateArtworkSessionLinks,
    refreshArtworks,
    refreshArtworksIfStale,
    artworksLoaded,
    artworksAuthoritative,
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
