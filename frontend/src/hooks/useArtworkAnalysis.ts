import { useState, useCallback, useRef } from 'react';
import { API_BASE_URL, API_ENDPOINTS } from '../constants/api';
import { artistAnalysisCache } from '../utils/artistAnalysisCache';
import { artworkSummaryCache } from '../utils/artworkSummaryCache';
import { savedArtworkApiService, SavedArtwork, ColorPalette } from '../services/savedArtworkApi';
import { compressImageToSize } from '../utils/imageUtils';
import { ArtworkMetadata } from '../utils/metadataUtils';

export interface Artist {
    artist_name: string;
    artwork_name?: string;
    score: number;
    reason: string;
}

interface AnalysisResponse {
    analysis?: string;
    tags?: string;
}

export const useArtworkAnalysis = (photoUri: string, identity: string = 'museum_narrator', language: string = 'en', initialMetadata?: ArtworkMetadata) => {
    const [artists, setArtists] = useState<Artist[]>([]);
    const [artworkAnalysis, setArtworkAnalysis] = useState<string>('');
    const [artworkTags, setArtworkTags] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [savedArtworkId, setSavedArtworkId] = useState<string | null>(null);
    const [artworkBites, setArtworkBites] = useState<Array<{ content: string; topic?: string; role?: 'user' | 'assistant' }>>([]);
    const [isBiteLoading, setIsBiteLoading] = useState(false);
    const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
    const [isTopicLoading, setIsTopicLoading] = useState(false);
    const isIdentifyingRef = useRef(false);
    const hasCompletedInitialSaveRef = useRef(false);

    const saveArtworkToDatabase = useCallback(async (artist: Artist, colorPalette?: ColorPalette, tags?: string[], analysis?: string): Promise<string | null> => {
        // Prevent duplicate saves in the same session/view
        if (hasCompletedInitialSaveRef.current && savedArtworkId) return savedArtworkId;

        try {
            const artistLower = artist.artist_name.toLowerCase().trim();
            const artworkLower = (artist.artwork_name || 'untitled').toLowerCase().trim();

            const isRecognized =
                artistLower !== 'unknown' &&
                artistLower !== 'untitled' &&
                artistLower !== '' &&
                artworkLower !== 'unknown' &&
                artworkLower !== 'untitled' &&
                artworkLower !== '' &&
                !artistLower.includes('not an artwork') &&
                !artworkLower.includes('not an artwork');

            // Use passed tags/analysis or current state as fallback
            const finalTags = tags ? tags.join(', ') : (artworkTags.length > 0 ? artworkTags.join(', ') : undefined);
            const finalAnalysis = analysis || artworkAnalysis || undefined;

            const result = await savedArtworkApiService.saveArtwork({
                photoUri,
                artistName: artist.artist_name,
                artworkName: artist.artwork_name || 'Unknown',
                conversationHistory: [],
                isRecognized,
                tags: finalTags,
                analysis: finalAnalysis,
                colorPalette,
                location: initialMetadata?.location,
                photoTime: initialMetadata?.createdTime, // Use createdTime as photoTime
                createdTime: initialMetadata?.createdTime,
            });

            setSavedArtworkId(result.id);
            hasCompletedInitialSaveRef.current = true;
            return result.id;
        } catch (error) {
            console.error('[useArtworkAnalysis] Error saving artwork:', error);
            return null;
        }
    }, [photoUri, initialMetadata]); // Removed artworkTags and artworkAnalysis to break loop

    const startBackgroundSummaryGeneration = useCallback(async (artworkId: string) => {
        try {
            const cached = artworkSummaryCache.get(artworkId);
            if (cached?.data || cached?.promise) return;

            const summaryPromise = savedArtworkApiService.generateArtworkSummary(artworkId, photoUri, language);
            artworkSummaryCache.set(artworkId, summaryPromise);
        } catch (error) {
            console.error('[useArtworkAnalysis] Error starting summary generation:', error);
        }
    }, [photoUri, language]);

    const fetchArtistIdentification = useCallback(async (colorPalette?: ColorPalette) => {
        if (isIdentifyingRef.current) return;

        try {
            isIdentifyingRef.current = true;
            setIsLoading(true);
            setHasError(false);
            setErrorMessage('');

            const cached = artistAnalysisCache.get(photoUri);
            let data;

            if (cached?.data) {
                data = cached.data;
            } else if (cached?.promise) {
                data = await cached.promise;
            } else {
                // No cached promise, start the identification process
                const identificationPromise = savedArtworkApiService.identifyArtist(photoUri, identity, language);
                artistAnalysisCache.set(photoUri, identificationPromise);
                data = await identificationPromise;
            }

            let artistsData: Artist[];
            let analysisContent: string = '';
            let tagsArray: string[] = [];

            let analysisText = data.analysis;
            if (typeof analysisText === 'string') {
                analysisText = analysisText.trim();
                const codeBlockRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/;
                const match = analysisText.match(codeBlockRegex);
                if (match) {
                    analysisText = match[1].trim();
                }
                artistsData = JSON.parse(analysisText);
            } else {
                artistsData = analysisText;
            }

            const lastItem = artistsData[artistsData.length - 1];
            if (lastItem && 'analysis' in lastItem && !('artist_name' in lastItem)) {
                analysisContent = (lastItem as AnalysisResponse).analysis || '';
                if ((lastItem as AnalysisResponse).tags) {
                    tagsArray = (lastItem as AnalysisResponse).tags!.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
                }
                artistsData = artistsData.slice(0, -1);
            }

            setArtists(artistsData);
            setArtworkAnalysis(analysisContent);
            setArtworkTags(tagsArray);

            if (artistsData.length > 0) {
                const firstArtist = artistsData[0];
                // Pass direct values to avoid waiting for state update (which creates the loop)
                const artworkId = await saveArtworkToDatabase(firstArtist, colorPalette, tagsArray, analysisContent);
                if (artworkId) {
                    startBackgroundSummaryGeneration(artworkId);
                }
            }
        } catch (error) {
            console.error('[useArtworkAnalysis] Error identifying artist:', error);
            setHasError(true);
            setErrorMessage(error instanceof Error ? error.message : 'Failed to identify artists.');
            artistAnalysisCache.clear(photoUri);
        } finally {
            setIsLoading(false);
            isIdentifyingRef.current = false;
        }
    }, [photoUri, identity, language, saveArtworkToDatabase, startBackgroundSummaryGeneration]);

    const fetchSuggestedTopics = useCallback(async (id: string) => {
        try {
            setIsTopicLoading(true);
            const topicUrl = `${API_BASE_URL}${API_ENDPOINTS.ANALYZE_TOPIC}?saved_artwork_id=${id}&identity=${encodeURIComponent(identity)}&language=${language}`;
            const response = await fetch(topicUrl);
            if (!response.ok) throw new Error('Failed to fetch topics');
            const data = await response.json();
            if (data.suggested_topics) setSuggestedTopics(data.suggested_topics);
        } catch (error) {
            console.error('[useArtworkAnalysis] Error fetching topics:', error);
        } finally {
            setIsTopicLoading(false);
        }
    }, [identity, language]);

    const fetchArtworkBite = useCallback(async (topic?: string, artistOverride?: Artist) => {
        const selectedArtist = artistOverride || artists[0];
        if (!selectedArtist) return;

        try {
            setIsBiteLoading(true);
            setSuggestedTopics([]);

            const compressed = await compressImageToSize(photoUri, 4 * 1024 * 1024);
            const formData = new FormData();
            formData.append('image', {
                uri: compressed.uri,
                type: 'image/jpeg',
                name: 'artwork.jpg',
            } as any);
            formData.append('artist_name', selectedArtist.artist_name);
            formData.append('artwork_name', selectedArtist.artwork_name || 'Unknown');
            formData.append('identity', identity);
            formData.append('language', language);

            if (savedArtworkId) {
                formData.append('saved_artwork_id', savedArtworkId);
            }

            if (topic) {
                formData.append('topic', topic);
                setArtworkBites(prev => [...prev, { content: topic, role: 'user' }]);
            }

            const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.ANALYZE_BITE}`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Failed to fetch bite');
            const data = await response.json();

            setArtworkBites(prev => [...prev, {
                content: data.bite,
                topic: topic,
                role: 'assistant',
            }]);

            if (savedArtworkId) {
                setTimeout(() => fetchSuggestedTopics(savedArtworkId), 500);
            }
        } catch (error) {
            console.error('[useArtworkAnalysis] Error fetching bite:', error);
            setArtworkBites(prev => [...prev, {
                content: 'Failed to load artwork information.',
                role: 'assistant',
            }]);
        } finally {
            setIsBiteLoading(false);
        }
    }, [photoUri, identity, language, artists, savedArtworkId, fetchSuggestedTopics]);

    return {
        artists,
        artworkAnalysis,
        artworkTags,
        isLoading,
        hasError,
        errorMessage,
        savedArtworkId,
        artworkBites,
        isBiteLoading,
        suggestedTopics,
        isTopicLoading,
        fetchArtistIdentification,
        fetchArtworkBite,
        setArtists,
        setSavedArtworkId,
    };
};
