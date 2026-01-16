import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    Dimensions,
    Animated,
    ScrollView,
    TextInput,
    Modal,
    Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { useLanguage } from '../contexts/LanguageContext';
import {
    Heading2,
    Label,
    ActionButton,
    FlippableArtworkCard,
    ArtistDiscoveryList,
    ExplorationOverlay
} from '../components';
import { spacing, borderRadius, shadows } from '../constants/theme';
import { savedArtworkApiService, ColorPalette } from '../services/savedArtworkApi';
import { artworkSummaryCache } from '../utils/artworkSummaryCache';
import { useArtworkAnalysis } from '../hooks/useArtworkAnalysis';
import { softenColor } from '../utils/colorUtils';

const { width } = Dimensions.get('window');

// Web implementation of ArtworkAnalysisScreen
export default function ArtworkAnalysisScreen({ route, navigation }: any) {
    const { photoUri, identity = 'museum_narrator', metadata } = route.params;
    const safeAreaInsets = useSafeAreaInsets();
    const { language } = useLanguage();

    // Custom Hooks
    const {
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
    } = useArtworkAnalysis(photoUri, identity, language, metadata);

    // Local UI State
    const [expandedArtistIndex, setExpandedArtistIndex] = useState<number | null>(null);
    const [selectedArtistIndex, setSelectedArtistIndex] = useState<number | null>(null);
    const [showExplorationOverlay, setShowExplorationOverlay] = useState(false);
    const [showManualInput, setShowManualInput] = useState(false);
    const [manualArtistName, setManualArtistName] = useState('');
    const [manualArtworkName, setManualArtworkName] = useState('');
    const [manualInputSubmitted, setManualInputSubmitted] = useState(false);
    const [backgroundColor, setBackgroundColor] = useState(colors.background);
    const [colorPalette, setColorPalette] = useState<ColorPalette | null>(null);

    useEffect(() => {
        // On web, we skip complex native color extraction for now or use a basic fallback
        // In a real app, we could use a canvas-based extraction
        setBackgroundColor(colors.background);
        fetchArtistIdentification();
    }, [fetchArtistIdentification]);

    useEffect(() => {
        if (!isLoading && artists.length > 0 && selectedArtistIndex === null && !manualInputSubmitted) {
            setSelectedArtistIndex(0);
            setExpandedArtistIndex(0);
        }
    }, [isLoading, artists, selectedArtistIndex, manualInputSubmitted]);

    const handleManualInputSubmit = async () => {
        if (!manualArtistName.trim()) return;

        const manualArtist = {
            artist_name: manualArtistName.trim(),
            artwork_name: manualArtworkName.trim() || 'Unknown',
            score: 1.0,
            reason: 'Manually entered by user'
        };

        setArtists([manualArtist]);
        setSelectedArtistIndex(0);
        setExpandedArtistIndex(0);
        setManualInputSubmitted(true);
        setShowManualInput(false);

        if (savedArtworkId) {
            await savedArtworkApiService.updateSavedArtwork(savedArtworkId, manualArtist.artist_name, manualArtist.artwork_name);
            artworkSummaryCache.clear(savedArtworkId);
        }

        setManualArtistName('');
        setManualArtworkName('');
    };

    const handleContinueOrMore = () => {
        setShowExplorationOverlay(true);
        if (artworkBites.length === 0) {
            fetchArtworkBite(undefined, artists[selectedArtistIndex || 0]);
        }
    };

    const handleFinish = async () => {
        const selectedArtist = artists[selectedArtistIndex || 0];
        if (selectedArtistIndex !== 0 && selectedArtistIndex !== null && savedArtworkId) {
            await savedArtworkApiService.updateSavedArtwork(savedArtworkId, selectedArtist.artist_name, selectedArtist.artwork_name || 'Unknown');
            artworkSummaryCache.clear(savedArtworkId);
        }

        navigation.navigate('Summary', {
            photoUri,
            artistName: selectedArtist?.artist_name || 'Unknown',
            artworkName: selectedArtist?.artwork_name || 'Untitled',
            savedArtworkId: savedArtworkId || '',
            conversationHistory: artworkBites,
        });
    };

    return (
        <View style={[styles.container, { paddingTop: safeAreaInsets.top, backgroundColor }]}>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={styles.contentWrapper}>
                    <FlippableArtworkCard
                        photoUri={photoUri}
                        photoUriNoBackground={null}
                        showBackgroundRemoved={false}
                    />

                    <ArtistDiscoveryList
                        isLoading={isLoading}
                        hasError={hasError}
                        errorMessage={errorMessage}
                        onRetry={fetchArtistIdentification}
                        onBack={() => navigation.navigate('Home')}
                        artists={artists}
                        expandedArtistIndex={expandedArtistIndex}
                        onArtistPress={(index) => {
                            setExpandedArtistIndex(index === expandedArtistIndex ? null : index);
                            setSelectedArtistIndex(index);
                        }}
                        artworkBitesLength={artworkBites.length}
                        artworkTags={artworkTags}
                        artworkAnalysis={artworkAnalysis}
                        isUnknownArtist={false}
                        manualInputSubmitted={manualInputSubmitted}
                        onManualInputPress={() => setShowManualInput(true)}
                    />

                    {!isLoading && !hasError && (
                        <View style={styles.actionButtonsContainer}>
                            <ActionButton label="Explore now" onPress={handleContinueOrMore} disabled={selectedArtistIndex === null} />
                            <ActionButton label="Finish" onPress={handleFinish} />
                        </View>
                    )}
                </View>
            </ScrollView>

            <Modal visible={showManualInput} transparent animationType="fade" onRequestClose={() => setShowManualInput(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Heading2 style={styles.modalTitle}>Enter Artwork Details</Heading2>
                        <View style={styles.inputContainer}>
                            <Label>Artist Name *</Label>
                            <TextInput style={styles.input} value={manualArtistName} onChangeText={setManualArtistName} autoCapitalize="words" />
                        </View>
                        <View style={styles.inputContainer}>
                            <Label>Artwork Name (Optional)</Label>
                            <TextInput style={styles.input} value={manualArtworkName} onChangeText={setManualArtworkName} autoCapitalize="words" />
                        </View>
                        <View style={styles.modalButtons}>
                            <ActionButton label="Cancel" onPress={() => setShowManualInput(false)} />
                            <ActionButton label="Submit" onPress={handleManualInputSubmit} />
                        </View>
                    </View>
                </View>
            </Modal>

            <ExplorationOverlay
                isVisible={showExplorationOverlay}
                onClose={() => setShowExplorationOverlay(false)}
                artworkBites={artworkBites}
                isBiteLoading={isBiteLoading}
                isTopicLoading={isTopicLoading}
                suggestedTopics={suggestedTopics}
                onFetchBite={(topic) => fetchArtworkBite(topic, artists[selectedArtistIndex || 0])}
                currentSelectedTopic={null}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: spacing['4xl'],
    },
    contentWrapper: {
        alignItems: 'center',
    },
    actionButtonsContainer: {
        flexDirection: 'row',
        gap: spacing.lg,
        marginTop: spacing['3xl'],
        justifyContent: 'center',
        width: '100%',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: colors.white,
        borderRadius: borderRadius.lg,
        padding: spacing['2xl'],
        width: '90%',
        maxWidth: 400,
        gap: spacing.lg,
        ...shadows.lg,
    },
    modalTitle: {
        textAlign: 'center',
    },
    inputContainer: {
        gap: spacing.sm,
    },
    input: {
        backgroundColor: colors.background,
        borderRadius: borderRadius.md,
        padding: spacing.base,
        fontFamily: 'IBM Plex Mono',
        fontSize: 16,
        color: colors.black,
        borderWidth: 1,
        borderColor: colors.darkGrey,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: spacing.base,
        justifyContent: 'space-between',
        marginTop: spacing.base,
    },
});
