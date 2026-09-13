type ArtworkBootstrapCacheItem = {
  id: string;
  clientId?: string;
  artworkId?: string;
  sessionId?: string;
  url: string;
  thumbnailUrl?: string;
  artistName?: string;
  artworkName?: string;
  description?: string;
  keywords: string[];
  date?: string;
  medium?: string;
  timestamp: number;
  sessionCapturedAt?: number;
  // Legacy v2 payloads used `visitId`; normalize them to `sessionId` on read.
  sessionLinks?: Array<{
    id?: string;
    sessionId: string;
    sequenceNumber?: number;
    source?: 'library' | 'upload' | 'camera';
    createdAt?: string;
  }>;
  location?: string;
  captureLocationOverride?: import('@musee/client-core').CaptureLocationOverride | null;
  photoTime?: string;
  captureMuseum?: {
    id: string;
    canonicalName: string;
  };
  movement?: string;
  periodBucket?: string;
  referenceUrls?: Array<{ page_url: string; thumbnail?: string; title?: string }>;
  insights?: Array<{ title: string; text: string }>;
  artistEntityId?: string;
  classification?: 'unsorted' | 'love' | 'respect' | 'not_for_me';
  analysisStatus?: 'pending' | 'analyzing' | 'reidentifying' | 'failed' | 'analyzed';
  analysisError?: string;
};

type ArtworkBootstrapCachePayload = {
  version: 2 | 3 | 4;
  userId: string;
  updatedAt: number;
  items: ArtworkBootstrapCacheItem[];
};

const ARTWORK_BOOTSTRAP_CACHE_KEY = 'musee_artwork_bootstrap_v4';
const PREVIOUS_ARTWORK_BOOTSTRAP_CACHE_KEY = 'musee_artwork_bootstrap_v3';
const LEGACY_ARTWORK_BOOTSTRAP_CACHE_KEY = 'musee_artwork_bootstrap_v2';
const ARTWORK_BOOTSTRAP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function readArtworkBootstrapCache(userId: string): ArtworkBootstrapCacheItem[] | null {
  try {
    const raw =
      localStorage.getItem(ARTWORK_BOOTSTRAP_CACHE_KEY) ||
      localStorage.getItem(PREVIOUS_ARTWORK_BOOTSTRAP_CACHE_KEY) ||
      localStorage.getItem(LEGACY_ARTWORK_BOOTSTRAP_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ArtworkBootstrapCachePayload;
    if (parsed.version !== 2 && parsed.version !== 3 && parsed.version !== 4) return null;
    if (parsed.userId !== userId) return null;
    if (!Array.isArray(parsed.items)) return null;
    if (Date.now() - parsed.updatedAt > ARTWORK_BOOTSTRAP_CACHE_TTL_MS) return null;

    return parsed.items.map((item) => {
      if (item.sessionId || !('visitId' in (item as Record<string, unknown>))) {
        return item;
      }

      const legacySessionId = (item as Record<string, unknown>).visitId;
      if (typeof legacySessionId !== 'string') {
        return item;
      }

      return {
        ...item,
        sessionId: legacySessionId,
      };
    });
  } catch {
    return null;
  }
}

function writeArtworkBootstrapCache(userId: string, items: ArtworkBootstrapCacheItem[]) {
  const payload: ArtworkBootstrapCachePayload = {
    version: 4,
    userId,
    updatedAt: Date.now(),
    items,
  };

  try {
    localStorage.setItem(ARTWORK_BOOTSTRAP_CACHE_KEY, JSON.stringify(payload));
    // Once the current version is written, the older generations are dead
    // weight — drop them instead of letting them accumulate forever.
    localStorage.removeItem(PREVIOUS_ARTWORK_BOOTSTRAP_CACHE_KEY);
    localStorage.removeItem(LEGACY_ARTWORK_BOOTSTRAP_CACHE_KEY);
  } catch {
    // Ignore storage quota/private browsing failures.
  }
}

export {
  readArtworkBootstrapCache,
  writeArtworkBootstrapCache,
  type ArtworkBootstrapCacheItem,
};
