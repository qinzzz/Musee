import { useState, useEffect, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { savedArtworkApiService, SavedArtwork } from '../services/savedArtworkApi';
import { historyCacheService } from '../services/historyCache';
import { artworkCacheService } from '../services/artworkCache';
import { Tag } from '../services/tagApi';

import { normalizeImageUri } from '../utils/imageUtils';
import { colors } from '../constants/colors';

export interface HistoryItem {
    id: string;
    uri: string;
    artistName: string;
    artworkName: string;
    createdAt?: string;
    backgroundColor?: string;
    isRecognized: boolean;
    tags?: Tag[];
}

export type HistoryTab = 'recognized' | 'unknown' | 'all';

export const useHistory = (selectedTab: HistoryTab) => {
    const [allItems, setAllItems] = useState<HistoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

    const convertToHistoryItems = useCallback((rawItems: any[]): HistoryItem[] => {
        return rawItems.map(item => ({
            id: item.id,
            uri: normalizeImageUri(item.photo_uri),
            artistName: item.artist_name,
            artworkName: item.artwork_name,
            createdAt: item.created_at,
            backgroundColor: item.background_color,
            isRecognized: item.is_recognized === 1 || item.is_recognized === true,
            tags: item.artwork_tags,
        }));
    }, []);

    // Filter items locally for zero-latency tab switching
    const items = useMemo(() => {
        let filtered = allItems;

        if (selectedTab === 'recognized') {
            filtered = allItems.filter(item => item.isRecognized);
        } else if (selectedTab === 'unknown') {
            filtered = allItems.filter(item => !item.isRecognized);
        } else if (selectedTab === 'all') {
            // Sort all by timestamp descending
            filtered = [...allItems].sort((a, b) => {
                const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return dateB - dateA;
            });
        }

        if (selectedTagId) {
            filtered = filtered.filter(item =>
                item.tags?.some(tag => tag.id === selectedTagId)
            );
        }

        return filtered;
    }, [allItems, selectedTab, selectedTagId]);

    const fetchFromBackend = useCallback(async () => {
        try {
            // Fetch ALL items to enable preloading and local filtering
            const response = await savedArtworkApiService.getSavedArtworks({
                limit: 100,
            });

            await historyCacheService.saveToCache(response.items);
            const convertedItems = convertToHistoryItems(response.items);
            setAllItems(convertedItems);

            const artworkIds = convertedItems.map(item => item.id);
            artworkCacheService.prefetch(artworkIds, (id) => savedArtworkApiService.getSavedArtwork(id));
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [convertToHistoryItems]);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const cachedData = await historyCacheService.getFromCache();

            if (cachedData) {
                const convertedItems = convertToHistoryItems(cachedData);
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
            console.error('[useHistory] Error loading history:', error);
            setAllItems([]);
            setIsLoading(false);
        }
    }, [convertToHistoryItems, fetchFromBackend]);

    const deleteItem = useCallback(async (itemId: string) => {
        try {
            await savedArtworkApiService.deleteSavedArtwork(itemId);
            setAllItems(prev => prev.filter(item => item.id !== itemId));
            return true;
        } catch (error) {
            console.error('[useHistory] Error deleting artwork:', error);
            Alert.alert('Error', 'Failed to delete artwork.');
            return false;
        }
    }, []);

    // Initial load
    useEffect(() => {
        loadData();
    }, [loadData]);

    const { commonTags, rareTags } = useMemo(() => {
        const tagMap = new Map<string, { tag: Tag; count: number }>();
        allItems.forEach(item => {
            item.tags?.forEach(tag => {
                const existing = tagMap.get(tag.id);
                if (existing) {
                    existing.count += 1;
                } else {
                    tagMap.set(tag.id, { tag, count: 1 });
                }
            });
        });

        const common: Tag[] = [];
        const rare: Tag[] = [];

        tagMap.forEach(entry => {
            if (entry.count >= 2) {
                common.push(entry.tag);
            } else {
                rare.push(entry.tag);
            }
        });

        return { commonTags: common, rareTags: rare };
    }, [allItems]);

    // Group items by artist for horizontal layout
    const groupedItems = useMemo(() => {
        if (allItems.length === 0) return [];

        // If a tag is selected, we return a single group "FILTERED RESULTS"
        // The UI will handle the grid layout if tag is selected
        if (selectedTagId) {
            const tag = [...commonTags, ...rareTags].find(t => t.id === selectedTagId);
            return [{
                title: tag ? `TAG: ${tag.name.toUpperCase()}` : 'FILTERED RESULTS',
                items: items
            }];
        }

        if (selectedTab === 'all') {
            return [{ title: 'ALL SCANS', items: items }];
        }

        if (selectedTab === 'unknown') {
            return [{ title: 'UNRECOGNIZED SCANS', items: items }];
        }

        // recognized tab
        const groups: { title: string; items: HistoryItem[] }[] = [];

        // 1. Group by Artist
        const artistMap = new Map<string, HistoryItem[]>();
        items.forEach(item => {
            const name = item.artistName || 'Unknown Artist';
            if (!artistMap.has(name)) {
                artistMap.set(name, []);
            }
            artistMap.get(name)?.push(item);
        });

        // Convert map to sorted groups
        const sortedArtists = Array.from(artistMap.keys()).sort();
        sortedArtists.forEach(artist => {
            const artistItems = artistMap.get(artist) || [];
            groups.push({
                title: artist.toUpperCase(),
                items: artistItems
            });
        });

        return groups;
    }, [items, selectedTab, selectedTagId, allItems, commonTags, rareTags]);


    return {
        items,
        groupedItems,
        isLoading,
        isRefreshing,
        refreshHistory: loadData,
        deleteItem,
        selectedTagId,
        setSelectedTagId,
        availableTags: commonTags,
        rareTags,
    };
};
