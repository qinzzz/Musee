import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';
import { colors } from '../constants/colors';
import { savedArtworkApiService, SavedArtwork, ColorPalette } from '../services/savedArtworkApi';
import { artworkCacheService } from '../services/artworkCache';
import { getColors } from 'react-native-image-colors';
import { compressImage, getCompressionSettings, resolvePhUri } from '../utils/imageUtils';
import { useIdentity } from '../contexts/IdentityContext';

export const useSavedArtwork = (artworkId: string, initialPhotoUri?: string, initialBackgroundColor?: string) => {
    const [artwork, setArtwork] = useState<SavedArtwork | null>(null);
    const [isLoading, setIsLoading] = useState(!initialPhotoUri);
    const [hasError, setHasError] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [photoUri, setPhotoUri] = useState(initialPhotoUri || '');
    const [backgroundColor, setBackgroundColor] = useState(initialBackgroundColor || colors.background);

    const [artworkBites, setArtworkBites] = useState<Array<{ content: string; topic?: string; role?: 'user' | 'assistant' }>>([]);
    const [isBiteLoading, setIsBiteLoading] = useState(false);
    const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
    const [isTopicLoading, setIsTopicLoading] = useState(false);
    const { identity } = useIdentity();

    const extractDominantColor = useCallback(async (targetArtwork: SavedArtwork) => {
        try {
            let imageUri = targetArtwork.photo_uri;

            // Ensure ph:// is resolved to a readable file://
            imageUri = await resolvePhUri(imageUri);

            const result = await getColors(imageUri, {
                fallback: colors.background,
                cache: true,
                key: targetArtwork.photo_uri,
            });

            if (result.platform === 'ios') {
                const colorPalette: ColorPalette = {
                    background: result.background || colors.background,
                    detail: result.detail || colors.background,
                    primary: result.primary || colors.background,
                    secondary: result.secondary || colors.background,
                };

                const updated = await savedArtworkApiService.updateSavedArtwork(
                    targetArtwork.id,
                    targetArtwork.artist_name,
                    targetArtwork.artwork_name,
                    targetArtwork.summary,
                    colorPalette
                );

                setArtwork(updated);
                artworkCacheService.set(targetArtwork.id, updated);
                if (updated.background_color) setBackgroundColor(updated.background_color);
            }
        } catch (error) {
            console.error('[useSavedArtwork] Color extraction error:', error);
        }
    }, []);

    const fetchSuggestedTopics = useCallback(async (id: string) => {
        try {
            setIsTopicLoading(true);
            const topicUrl = `${API_BASE_URL}${API_ENDPOINTS.ANALYZE_TOPIC}?saved_artwork_id=${id}&identity=${encodeURIComponent(identity)}`;
            const response = await fetch(topicUrl);
            if (!response.ok) throw new Error('Failed to fetch topics');
            const data = await response.json();
            if (data.suggested_topics) setSuggestedTopics(data.suggested_topics);
        } catch (error) {
            console.error('[useSavedArtwork] Topics error:', error);
        } finally {
            setIsTopicLoading(false);
        }
    }, [identity]);

    const fetchArtworkDetails = useCallback(async () => {
        try {
            if (!initialPhotoUri) setIsLoading(true);
            setHasError(false);

            const data = await artworkCacheService.getOrFetch(
                artworkId,
                () => savedArtworkApiService.getSavedArtwork(artworkId)
            );

            setArtwork(data);
            setPhotoUri(data.photo_uri);
            if (data.background_color && !initialBackgroundColor) {
                setBackgroundColor(data.background_color);
            }

            if (data.conversation_history) {
                setArtworkBites(data.conversation_history.map(msg => ({
                    content: msg.content,
                    role: msg.role as 'user' | 'assistant',
                })));
            }

            if (!data.color_palette) {
                extractDominantColor(data);
            }
        } catch (error) {
            console.error('[useSavedArtwork] Fetch error:', error);
            setHasError(true);
            setErrorMessage('Failed to load artwork details.');
        } finally {
            setIsLoading(false);
        }
    }, [artworkId, initialPhotoUri, initialBackgroundColor, extractDominantColor]);

    const fetchArtworkBite = useCallback(async (topic?: string) => {
        if (!artwork) return;

        try {
            setIsBiteLoading(true);
            setSuggestedTopics([]);

            const compressed = await compressImage(artwork.photo_uri, getCompressionSettings());
            const formData = new FormData();
            formData.append('image', {
                uri: compressed.uri,
                type: 'image/jpeg',
                name: 'artwork.jpg',
            } as any);
            formData.append('artist_name', artwork.artist_name);
            formData.append('artwork_name', artwork.artwork_name);
            formData.append('identity', identity);
            formData.append('saved_artwork_id', artworkId);

            if (topic) {
                formData.append('topic', topic);
                setArtworkBites(prev => [...prev, { content: topic, role: 'user' }]);
            }

            const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.ANALYZE_BITE}`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Bite API failed');
            const data = await response.json();

            setArtworkBites(prev => [...prev, {
                content: data.bite,
                topic: topic,
                role: 'assistant',
            }]);

            setTimeout(() => fetchSuggestedTopics(artworkId), 500);
        } catch (error) {
            console.error('[useSavedArtwork] Bite error:', error);
            setArtworkBites(prev => [...prev, {
                content: 'Failed to load info.',
                role: 'assistant',
            }]);
        } finally {
            setIsBiteLoading(false);
        }
    }, [artwork, artworkId, identity, fetchSuggestedTopics]);

    useEffect(() => {
        fetchArtworkDetails();
    }, [fetchArtworkDetails]);

    return {
        artwork,
        isLoading,
        hasError,
        errorMessage,
        photoUri,
        backgroundColor,
        artworkBites,
        isBiteLoading,
        suggestedTopics,
        isTopicLoading,
        fetchArtworkBite,
        fetchSuggestedTopics,
        refresh: fetchArtworkDetails,
    };
};
