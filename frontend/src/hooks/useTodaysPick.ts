import { useState, useEffect, useCallback } from 'react';
import { savedArtworkApiService } from '../services/savedArtworkApi';
import { todaysPickCacheService } from '../services/todaysPickCache';
import { normalizeImageUri } from '../utils/imageUtils';

export interface TodaysPickItem {
    id: string;
    uri: string;
    artistName: string;
    artworkName: string;
    backgroundColor?: string;
}

export const useTodaysPick = () => {
    const [picks, setPicks] = useState<TodaysPickItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchTodaysPicks = useCallback(async () => {
        try {
            setIsLoading(true);

            // Check cache first
            const cachedPicks = await todaysPickCacheService.get();
            if (cachedPicks && cachedPicks.length > 0) {
                console.log('[useTodaysPick] Using cached picks');
                setPicks(cachedPicks);
                setIsLoading(false);
                return;
            }

            // Cache miss or expired, fetch new picks
            console.log('[useTodaysPick] Fetching new picks');
            const response = await savedArtworkApiService.getSavedArtworks({
                limit: 100,
            });

            if (response.items.length === 0) {
                setPicks([]);
                return;
            }

            // Randomly select up to 5 items
            const shuffled = [...response.items].sort(() => Math.random() - 0.5);
            const selected = shuffled.slice(0, Math.min(5, shuffled.length));

            const pickItems: TodaysPickItem[] = selected.map(item => ({
                id: item.id,
                uri: normalizeImageUri(item.photo_uri),
                artistName: item.artist_name,
                artworkName: item.artwork_name,
                backgroundColor: item.background_color,
            }));

            setPicks(pickItems);

            // Cache the new picks for 24 hours
            await todaysPickCacheService.set(pickItems);
        } catch (error) {
            console.error('[useTodaysPick] Error fetching picks:', error);
            setPicks([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTodaysPicks();
    }, [fetchTodaysPicks]);

    return {
        picks,
        isLoading,
        refresh: fetchTodaysPicks,
    };
};
