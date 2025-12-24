import { useState, useEffect, useCallback } from 'react';
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
    const [items, setItems] = useState<GalleryItem[]>([]);
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

    const fetchFromBackend = useCallback(async () => {
        try {
            const recognizedOnly = selectedTab === 'recognized' ? true : false;
            const response = await savedArtworkApiService.getSavedArtworks({
                recognizedOnly,
                limit: 100,
            });

            await historyCacheService.saveToCache(response.items);
            const galleryItems = convertToGalleryItems(response.items);
            setItems(galleryItems);

            const artworkIds = galleryItems.map(item => item.id);
            artworkCacheService.prefetch(artworkIds, (id) => savedArtworkApiService.getSavedArtwork(id));
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [selectedTab, convertToGalleryItems]);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const cachedData = await historyCacheService.getFromCache();

            if (cachedData) {
                const filteredData = selectedTab === 'recognized'
                    ? cachedData.filter(item => item.is_recognized === 1)
                    : cachedData.filter(item => item.is_recognized === 0);

                const convertedItems = convertToGalleryItems(filteredData);
                setItems(convertedItems);
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
            setItems([]);
            setIsLoading(false);
        }
    }, [selectedTab, convertToGalleryItems, fetchFromBackend]);

    const deleteItem = useCallback(async (itemId: string) => {
        try {
            await savedArtworkApiService.deleteSavedArtwork(itemId);
            setItems(prev => prev.filter(item => item.id !== itemId));
            return true;
        } catch (error) {
            console.error('[useGallery] Error deleting artwork:', error);
            Alert.alert('Error', 'Failed to delete artwork.');
            return false;
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [selectedTab, loadData]);

    return {
        items,
        isLoading,
        isRefreshing,
        refresh: loadData,
        deleteItem,
    };
};
