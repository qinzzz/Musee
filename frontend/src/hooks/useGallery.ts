import { useState, useEffect, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { savedArtworkApiService, SavedArtwork } from '../services/savedArtworkApi';
import { historyCacheService } from '../services/historyCache';
import { artworkCacheService } from '../services/artworkCache';

export interface GalleryItem {
    id: string;
    uri: string;
    artistName: string;
    artworkName: string;
    createdAt?: string;
    backgroundColor?: string;
    isRecognized: boolean;
}

export const useGallery = (selectedTab: 'recognized' | 'unknown') => {
    const [allItems, setAllItems] = useState<GalleryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const convertToGalleryItems = useCallback((rawItems: any[]): GalleryItem[] => {
        return rawItems.map(item => ({
            id: item.id,
            uri: item.photo_uri,
            artistName: item.artist_name,
            artworkName: item.artwork_name,
            createdAt: item.created_at,
            backgroundColor: item.background_color,
            isRecognized: item.is_recognized === 1 || item.is_recognized === true,
        }));
    }, []);

    // Filter items locally for zero-latency tab switching
    const items = useMemo(() => {
        return allItems.filter(item =>
            selectedTab === 'recognized' ? item.isRecognized : !item.isRecognized
        );
    }, [allItems, selectedTab]);

    const fetchFromBackend = useCallback(async () => {
        try {
            // Fetch ALL items to enable preloading and local filtering
            const response = await savedArtworkApiService.getSavedArtworks({
                limit: 100,
            });

            await historyCacheService.saveToCache(response.items);
            const convertedItems = convertToGalleryItems(response.items);
            setAllItems(convertedItems);

            const artworkIds = convertedItems.map(item => item.id);
            artworkCacheService.prefetch(artworkIds, (id) => savedArtworkApiService.getSavedArtwork(id));
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [convertToGalleryItems]);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const cachedData = await historyCacheService.getFromCache();

            if (cachedData) {
                const convertedItems = convertToGalleryItems(cachedData);
                setAllItems(convertedItems);
                setIsLoading(false);

                const artworkIds = convertedItems.map(item => item.id);
                artworkCacheService.prefetch(artworkIds, (id) => savedArtworkApiService.getSavedArtwork(id));

                // Silently refresh in background
                fetchFromBackend();
            } else {
                await fetchFromBackend();
            }
        } catch (error) {
            console.error('[useGallery] Error loading photos:', error);
            setAllItems([]);
            setIsLoading(false);
        }
    }, [convertToGalleryItems, fetchFromBackend]);

    const deleteItem = useCallback(async (itemId: string) => {
        try {
            await savedArtworkApiService.deleteSavedArtwork(itemId);
            setAllItems(prev => prev.filter(item => item.id !== itemId));
            return true;
        } catch (error) {
            console.error('[useGallery] Error deleting artwork:', error);
            Alert.alert('Error', 'Failed to delete artwork.');
            return false;
        }
    }, []);

    // Initial load
    useEffect(() => {
        loadData();
    }, [loadData]);

    return {
        items,
        isLoading,
        isRefreshing,
        refresh: loadData,
        deleteItem,
    };
};
