import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = '@musee_history_cache';
const CACHE_TIMESTAMP_KEY = '@musee_history_timestamp';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export interface HistoryItem {
  id: string;
  photo_uri: string;
  artist_name: string;
  artwork_name: string;
  is_recognized: number;
  created_at: string;
  updated_at: string;
  background_color?: string;
}

interface CachedData {
  items: HistoryItem[];
  timestamp: number;
}

class HistoryCacheService {
  /**
   * Save history data to cache
   */
  async saveToCache(items: HistoryItem[]): Promise<void> {
    try {
      const data: CachedData = {
        items,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save to cache:', error);
    }
  }

  /**
   * Get cached history data if valid
   * Returns null if cache is expired or doesn't exist
   */
  async getFromCache(): Promise<HistoryItem[] | null> {
    try {
      const cachedDataStr = await AsyncStorage.getItem(CACHE_KEY);
      if (!cachedDataStr) {
        return null;
      }

      const cachedData: CachedData = JSON.parse(cachedDataStr);
      const now = Date.now();

      // Check if cache is still valid
      if (now - cachedData.timestamp < CACHE_DURATION) {
        console.log('[CACHE] Using cached history data');
        return cachedData.items;
      } else {
        console.log('[CACHE] Cache expired, fetching fresh data');
        return null;
      }
    } catch (error) {
      console.error('Failed to read from cache:', error);
      return null;
    }
  }

  /**
   * Check if cache is valid (not expired)
   */
  async isCacheValid(): Promise<boolean> {
    try {
      const cachedDataStr = await AsyncStorage.getItem(CACHE_KEY);
      if (!cachedDataStr) {
        return false;
      }

      const cachedData: CachedData = JSON.parse(cachedDataStr);
      const now = Date.now();

      return now - cachedData.timestamp < CACHE_DURATION;
    } catch (error) {
      return false;
    }
  }

  /**
   * Clear cached history data
   */
  async clearCache(): Promise<void> {
    try {
      await AsyncStorage.removeItem(CACHE_KEY);
      console.log('[CACHE] History cache cleared');
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }

  /**
   * Invalidate cache (force refresh on next load)
   */
  async invalidateCache(): Promise<void> {
    await this.clearCache();
  }
}

export const historyCacheService = new HistoryCacheService();
