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
    onRegenerate?: () => void;
    isRegenerating?: boolean;
    onTagsUpdated?: () => void;
}

export const ArtworkDetailCard: React.FC<ArtworkDetailCardProps> = ({
    artwork,
    photoUri,
    backgroundColor,
    cardOpacity,
    onImagePress,
    onEdit,
    onRegenerate,
    isRegenerating,
    onTagsUpdated,
}) => {
    return (
        <Animated.View style={[styles.cardContainer, { opacity: cardOpacity }]}>
            <ArtworkImageContainer
                imageUri={photoUri}
                withShadow={true}
                onPress={onImagePress}
                marginTop={0}
            />
            <SavedArtistCard
                artistName={artwork?.artist_name || 'Loading...'}
                title={artwork?.artwork_name || 'Identifying artwork...'}
                summary={artwork?.summary || 'Generating analysis...'}
                location={artwork?.location}
                photoTime={artwork?.photo_time}
                tags={artwork?.artwork_tags}
                analysis={artwork?.analysis}
                withShadow={true}
                backgroundColor={backgroundColor}
                onPress={() => { }}
                onEdit={onEdit}
                onRegenerate={onRegenerate}
                isRegenerating={isRegenerating}
                artworkId={artwork?.id}
                onTagsUpdated={onTagsUpdated}
            />
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    cardContainer: {
        width: '100%',
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.md,
        gap: spacing.md,
        alignItems: 'stretch',
    },
});
