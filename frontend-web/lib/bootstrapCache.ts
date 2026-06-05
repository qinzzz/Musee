type ArtworkBootstrapCacheItem = {
  id: string;
  artworkId?: string;
  url: string;
  artistName?: string;
  artworkName?: string;
  description?: string;
  keywords: string[];
  date?: string;
  medium?: string;
  timestamp: number;
  sessionCapturedAt?: number;
  visitId?: string;
  location?: string;
  photoTime?: string;
  sessionTitle?: string;
  movement?: string;
  periodBucket?: string;
  referenceUrls?: Array<{ page_url: string; thumbnail?: string; title?: string }>;
  insights?: Array<{ title: string; text: string }>;
  artistEntityId?: string;
  classification?: 'unsorted' | 'love' | 'respect' | 'not_for_me';
};

type ArtworkBootstrapCachePayload = {
  version: 1;
  userId: string;
  updatedAt: number;
  items: ArtworkBootstrapCacheItem[];
};

const ARTWORK_BOOTSTRAP_CACHE_KEY = 'musee_artwork_bootstrap_v1';
const ARTWORK_BOOTSTRAP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function readArtworkBootstrapCache(userId: string): ArtworkBootstrapCacheItem[] | null {
  try {
    const raw = localStorage.getItem(ARTWORK_BOOTSTRAP_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ArtworkBootstrapCachePayload;
    if (parsed.version !== 1) return null;
    if (parsed.userId !== userId) return null;
    if (!Array.isArray(parsed.items)) return null;
    if (Date.now() - parsed.updatedAt > ARTWORK_BOOTSTRAP_CACHE_TTL_MS) return null;

    return parsed.items;
  } catch {
    return null;
  }
}

function writeArtworkBootstrapCache(userId: string, items: ArtworkBootstrapCacheItem[]) {
  const payload: ArtworkBootstrapCachePayload = {
    version: 1,
    userId,
    updatedAt: Date.now(),
    items,
  };

  try {
    localStorage.setItem(ARTWORK_BOOTSTRAP_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota/private browsing failures.
  }
}

export {
  readArtworkBootstrapCache,
  writeArtworkBootstrapCache,
  type ArtworkBootstrapCacheItem,
};
