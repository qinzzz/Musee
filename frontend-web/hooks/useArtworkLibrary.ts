import { useEffect, useRef, useState } from 'react';
import {
  fetchUserArtworks,
  resolveImageUrl,
  updateArtworkClassification,
} from '../api/artworks';
import type { ArtworkClassification, GalleryItem, SessionLink, TagCoordinate } from '../types';
import type { ArtworkDetailContext } from '../lib/appNavigation';
import {
  readArtworkBootstrapCache,
  writeArtworkBootstrapCache,
  type ArtworkBootstrapCacheItem,
} from '../lib/bootstrapCache';

export type InterpretingItem = GalleryItem & {
  allVisitItems?: GalleryItem[];
  is_liked?: boolean;
};

type UseArtworkLibraryOptions = {
  userId: string;
  showToast: (message: string, type?: 'info' | 'success') => void;
  onMissingArtworkFromHistory?: () => void;
  onArtworkDetailContextChange?: (context: ArtworkDetailContext | null) => void;
  onTagPositionsLoaded?: (updater: (prev: Record<string, TagCoordinate>) => Record<string, TagCoordinate>) => void;
};

const parseAnalysis = (text: string | null): string => {
  if (!text) return '';

  const trimmed = text.trim();
  const dateMatch = trimmed.match(/^Date:\s*(.+)$/im);
  const mediumMatch = trimmed.match(/^Medium:\s*(.+)$/im);

  let cleaned = trimmed
    .replace(/^Date:\s*.+$/gim, '')
    .replace(/^Medium:\s*.+$/gim, '')
    .replace(/^Analysis:\s*/i, '')
    .trim();

  if (!cleaned && (dateMatch || mediumMatch)) {
    cleaned = trimmed;
  }

  return cleaned;
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
          sessionTitle: link.session_title,
          sequenceNumber: link.sequence_number,
          source: link.source,
          createdAt: link.created_at,
        }))
    : [];

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
    visitId: item.session_id,
    sessionLinks,
    location: item.location && typeof item.location === 'object' ? JSON.stringify(item.location) : item.location,
    photoTime: item.photo_time,
    sessionTitle: item.session_title,
    movement: item.movement,
    periodBucket: item.period_bucket,
    referenceUrls: item.reference_urls || [],
    insights: item.insights || [],
    artistEntityId: item.artist_entity_id || undefined,
    classification: item.classification || 'unsorted',
    syncStatus: 'synced',
    conversation: (item.conversation_history || []).map((message: any) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      text: message.content,
    })),
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
    visitId: item.visitId,
    sessionLinks: item.sessionLinks,
    location: item.location,
    photoTime: item.photoTime,
    sessionTitle: item.sessionTitle,
    movement: item.movement,
    periodBucket: item.periodBucket,
    referenceUrls: item.referenceUrls,
    insights: item.insights,
    artistEntityId: item.artistEntityId,
    classification: item.classification,
    syncStatus: 'synced',
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
    visitId: item.visitId,
    sessionLinks: item.sessionLinks,
    location: typeof item.location === 'string' ? item.location : undefined,
    photoTime: item.photoTime,
    sessionTitle: item.sessionTitle,
    movement: item.movement,
    periodBucket: item.periodBucket,
    referenceUrls: item.referenceUrls,
    insights: item.insights,
    artistEntityId: item.artistEntityId,
    classification: item.classification,
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
  const [interpretingItem, setInterpretingItem] = useState<InterpretingItem | null>(null);
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

  const buildInterpretingItem = (item: GalleryItem, allItems?: GalleryItem[]): InterpretingItem => {
    const resolvedItems = allItems ?? (item.visitId ? items.filter((entry) => entry.visitId === item.visitId) : [item]);
    return {
      ...item,
      visitId: item.visitId,
      allVisitItems: resolvedItems,
    };
  };

  const restoreArtworkFromHistory = (artworkId: string, context: ArtworkDetailContext) => {
    const sourceItem = items.find((item) => item.id === artworkId || item.artworkId === artworkId);
    if (!sourceItem) {
      setInterpretingItem(null);
      onArtworkDetailContextChange?.(null);
      onMissingArtworkFromHistory?.();
      return;
    }
    onArtworkDetailContextChange?.(context);
    setInterpretingItem(buildInterpretingItem(sourceItem));
  };

  const handleUpdateClassification = async (itemId: string, classification: ArtworkClassification) => {
    const previous = items.find((item) => item.id === itemId)?.classification || 'unsorted';
    if (previous === classification) return;

    setItems((prev) => prev.map((item) => item.id === itemId ? { ...item, classification } : item));
    setInterpretingItem((prev) => prev?.id === itemId ? { ...prev, classification } : prev);
    setProfileRefreshKey((prev) => prev + 1);

    try {
      await updateArtworkClassification(itemId, classification);
    } catch (error) {
      console.error('Failed to update artwork classification:', error);
      setItems((prev) => prev.map((item) => item.id === itemId ? { ...item, classification: previous } : item));
      setInterpretingItem((prev) => prev?.id === itemId ? { ...prev, classification: previous } : prev);
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
    setInterpretingItem((prev) => prev?.id === id ? { ...prev, ...updates } : prev);
  };

  return {
    items,
    setItems,
    artworksLoaded,
    profileRefreshKey,
    interpretingItem,
    setInterpretingItem,
    buildInterpretingItem,
    restoreArtworkFromHistory,
    handleUpdateClassification,
    updateItemMetadata,
  };
}
