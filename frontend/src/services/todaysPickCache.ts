import AsyncStorage from '@react-native-async-storage/async-storage';
import { TodaysPickItem } from '../hooks/useTodaysPick';

const CACHE_KEY = 'todaysPick';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

interface CachedData {
    picks: TodaysPickItem[];
    timestamp: number;
}

export const todaysPickCacheService = {
    async get(): Promise<TodaysPickItem[] | null> {
        try {
            const cached = await AsyncStorage.getItem(CACHE_KEY);
            if (!cached) return null;

            const data: CachedData = JSON.parse(cached);
            const now = Date.now();

            // Check if cache is still valid (within 24 hours)
            if (now - data.timestamp < CACHE_DURATION) {
                console.log('[TodaysPickCache] Returning cached picks');
                return data.picks;
            }

            // Cache expired
            console.log('[TodaysPickCache] Cache expired, clearing');
            await this.clear();
            return null;
        } catch (error) {
            console.error('[TodaysPickCache] Error reading cache:', error);
            return null;
        }
    },

    async set(picks: TodaysPickItem[]): Promise<void> {
        try {
            const data: CachedData = {
                picks,
                timestamp: Date.now(),
            };
            await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
            console.log('[TodaysPickCache] Cached picks for 24 hours');
        } catch (error) {
            console.error('[TodaysPickCache] Error saving cache:', error);
        }
    },

    async clear(): Promise<void> {
        try {
            await AsyncStorage.removeItem(CACHE_KEY);
            console.log('[TodaysPickCache] Cache cleared');
        } catch (error) {
            console.error('[TodaysPickCache] Error clearing cache:', error);
        }
    },
};
