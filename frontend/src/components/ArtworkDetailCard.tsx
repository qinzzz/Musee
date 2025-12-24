import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { borderRadius, shadows, spacing } from '../constants/theme';
import { ArtworkImageContainer, SavedArtistCard } from './index';
import { SavedArtwork } from '../services/savedArtworkApi';

interface ArtworkDetailCardProps {
    artwork: SavedArtwork | null;
    photoUri: string;
    backgroundColor: string;
    cardOpacity: Animated.Value;
    onImagePress: () => void;
    onEdit: (artistName: string, title: string, summary: string) => Promise<void>;
}

export const ArtworkDetailCard: React.FC<ArtworkDetailCardProps> = ({
    artwork,
    photoUri,
    backgroundColor,
    cardOpacity,
    onImagePress,
    onEdit,
}) => {
    return (
        <Animated.View style={[styles.cardContainer, { backgroundColor: backgroundColor, opacity: cardOpacity }]}>
            <ArtworkImageContainer
                imageUri={photoUri}
                withShadow={true}
                onPress={onImagePress}
            />
            <SavedArtistCard
                artistName={artwork?.artist_name || 'Loading...'}
                title={artwork?.artwork_name || 'Identifying artwork...'}
                summary={artwork?.summary || 'Generating analysis...'}
                withShadow={true}
                backgroundColor={backgroundColor}
                onPress={() => { }}
                onEdit={onEdit}
            />
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    cardContainer: {
        width: '92%',
        height: '85%',
        borderRadius: borderRadius.lg,
        paddingVertical: spacing['3xl'],
        paddingHorizontal: spacing['xl'],
        gap: spacing.xl,
        alignItems: 'stretch',
        justifyContent: 'space-around',
        ...shadows.lg,
    },
});
