import { SavedArtwork } from './savedArtworkApi';

/**
 * In-memory cache for artwork details
 * Pre-fetches nearby artworks for smooth navigation
 */
class ArtworkCacheService {
  private cache: Map<string, SavedArtwork> = new Map();
  private fetchPromises: Map<string, Promise<SavedArtwork>> = new Map();

  /**
   * Get artwork from cache
   */
  get(artworkId: string): SavedArtwork | null {
    return this.cache.get(artworkId) || null;
  }

  /**
   * Store artwork in cache
   */
  set(artworkId: string, artwork: SavedArtwork): void {
    console.log('[ArtworkCache] Caching artwork:', artworkId);
    this.cache.set(artworkId, artwork);
  }

  /**
   * Check if artwork is in cache
   */
  has(artworkId: string): boolean {
    return this.cache.has(artworkId);
  }

  /**
   * Get or fetch artwork (with deduplication)
   * If multiple requests for same artwork happen simultaneously,
   * only one fetch is made
   */
  async getOrFetch(
    artworkId: string,
    fetchFn: () => Promise<SavedArtwork>
  ): Promise<SavedArtwork> {
    // Return from cache if available
    const cached = this.cache.get(artworkId);
    if (cached) {
      console.log('[ArtworkCache] Cache hit:', artworkId);
      return cached;
    }

    // Check if already fetching
    const existingPromise = this.fetchPromises.get(artworkId);
    if (existingPromise) {
      console.log('[ArtworkCache] Using existing fetch promise:', artworkId);
      return existingPromise;
    }

    // Fetch and cache
    console.log('[ArtworkCache] Cache miss, fetching:', artworkId);
    const promise = fetchFn()
      .then(artwork => {
        this.set(artworkId, artwork);
        this.fetchPromises.delete(artworkId);
        return artwork;
      })
      .catch(error => {
        this.fetchPromises.delete(artworkId);
        throw error;
      });

    this.fetchPromises.set(artworkId, promise);
    return promise;
  }

  /**
   * Pre-fetch artworks in background
   * Does not throw errors, just logs them
   */
  async prefetch(
    artworkIds: string[],
    fetchFn: (id: string) => Promise<SavedArtwork>
  ): Promise<void> {
    console.log('[ArtworkCache] Pre-fetching', artworkIds.length, 'artworks');

    const promises = artworkIds.map(async (id) => {
      // Skip if already cached or being fetched
      if (this.has(id) || this.fetchPromises.has(id)) {
        return;
      }

      try {
        await this.getOrFetch(id, () => fetchFn(id));
      } catch (error) {
        console.warn('[ArtworkCache] Pre-fetch failed for:', id, error);
        // Don't throw - pre-fetching is best-effort
      }
    });

    await Promise.allSettled(promises);
    console.log('[ArtworkCache] Pre-fetch complete. Cache size:', this.cache.size);
  }

  /**
   * Clear specific artwork from cache
   */
  invalidate(artworkId: string): void {
    console.log('[ArtworkCache] Invalidating:', artworkId);
    this.cache.delete(artworkId);
    this.fetchPromises.delete(artworkId);
  }

  /**
   * Clear all cached artworks
   */
  clear(): void {
    console.log('[ArtworkCache] Clearing all cache. Size was:', this.cache.size);
    this.cache.clear();
    this.fetchPromises.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      pendingFetches: this.fetchPromises.size,
    };
  }
}

export const artworkCacheService = new ArtworkCacheService();
