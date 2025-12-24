import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Typography, LoadingProgressBar, ArtistCard, ActionButton, ArtworkBite } from './index';
import { colors } from '../constants/colors';
import { spacing, borderRadius } from '../constants/theme';
import { Artist } from '../hooks/useArtworkAnalysis';

interface ArtistDiscoveryListProps {
    isLoading: boolean;
    hasError: boolean;
    errorMessage?: string;
    onRetry: () => void;
    onBack: () => void;
    artists: Artist[];
    expandedArtistIndex: number | null;
    onArtistPress: (index: number) => void;
    artworkBitesLength: number;
    artworkTags: string[];
    artworkAnalysis?: string;
    isUnknownArtist: boolean;
    manualInputSubmitted: boolean;
    onManualInputPress: () => void;
}

export const ArtistDiscoveryList: React.FC<ArtistDiscoveryListProps> = ({
    isLoading,
    hasError,
    errorMessage,
    onRetry,
    onBack,
    artists,
    expandedArtistIndex,
    onArtistPress,
    artworkBitesLength,
    artworkTags,
    artworkAnalysis,
    isUnknownArtist,
    manualInputSubmitted,
    onManualInputPress,
}) => {
    if (isLoading) {
        return (
            <View style={styles.artistListBelow}>
                <LoadingProgressBar message="Recognizing..." />
            </View>
        );
    }

    if (hasError) {
        return (
            <View style={styles.artistListBelow}>
                <View style={styles.errorContainer}>
                    <Typography variant="body" style={styles.errorText}>
                        {errorMessage || 'Something went wrong'}
                    </Typography>
                    <ActionButton label="Retry" onPress={onRetry} />
                    <ActionButton label="Go Back" onPress={onBack} />
                </View>
            </View>
        );
    }

    return (
        <View style={styles.artistListBelow}>
            <View style={styles.discoveryContainer}>
                <View style={styles.artistListCentered}>
                    {artists.map((artist, index) => {
                        const isExpanded = expandedArtistIndex === index && artworkBitesLength === 0;
                        return (
                            <ArtistCard
                                key={index}
                                artistName={artist.artist_name}
                                details={`${artist.artwork_name || 'Unknown'} (${artist.score * 10}%)`}
                                description={artist.reason}
                                isExpanded={isExpanded}
                                onPress={() => onArtistPress(index)}
                            />
                        );
                    })}
                </View>

                {(artworkTags.length > 0 || artworkAnalysis) && (
                    <>
                        <View style={styles.sectionDivider} />

                        {artworkTags.length > 0 && (
                            <View style={styles.tagsContainer}>
                                {artworkTags.map((tag, index) => (
                                    <View key={index} style={styles.tag}>
                                        <Typography variant="label" style={styles.tagText}>
                                            {tag}
                                        </Typography>
                                    </View>
                                ))}
                            </View>
                        )}

                        {artworkAnalysis && (
                            <View style={styles.analysisContainer}>
                                <ArtworkBite content={artworkAnalysis} />
                            </View>
                        )}
                    </>
                )}
            </View>

            {isUnknownArtist && !manualInputSubmitted && (
                <View style={styles.manualInputPrompt}>
                    <ActionButton label="Manual Input" onPress={onManualInputPress} />
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    artistListBelow: {
        marginTop: spacing['4xl'],
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        alignItems: 'center',
        width: '100%',
    },
    discoveryContainer: {
        width: '100%',
        backgroundColor: colors.white,
        borderRadius: borderRadius['2xl'],
        padding: spacing.xl,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
        gap: spacing.xl,
    },
    artistListCentered: {
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: spacing.base,
        width: '100%',
    },
    tagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
        width: '100%',
        marginBottom: spacing.base,
    },
    tag: {
        paddingHorizontal: spacing.base,
        paddingVertical: spacing.xs,
        backgroundColor: colors.background,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: colors.midGrey,
    },
    tagText: {
        fontSize: 12,
        color: colors.darkGrey,
    },
    analysisContainer: {
        width: '100%',
        alignItems: 'stretch',
    },
    sectionDivider: {
        width: '100%',
        height: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
    errorContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        gap: spacing.lg,
        paddingVertical: spacing['2xl'],
    },
    errorText: {
        color: colors.darkGrey,
        textAlign: 'center',
        marginBottom: spacing.base,
        fontFamily: 'PP Neue Montreal',
    },
    manualInputPrompt: {
        marginBottom: spacing.lg,
        alignItems: 'center',
        gap: spacing.base,
        paddingVertical: spacing.lg,
    },
});
