import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MobileArtworkRecord } from '../../library/types';
import { colors, radii, spacing, typography } from '../../ui/tokens/theme';
import type { SessionArtworkGroup } from '../sessionArtworkPresentation';

type SessionArtworkCardsProps = {
  group: SessionArtworkGroup;
  onOpenArtwork: (artworkId: string) => void;
};

export function SessionArtworkCards({ group, onOpenArtwork }: SessionArtworkCardsProps) {
  return (
    <View accessibilityLabel={group.label} style={styles.group}>
      <Text style={styles.label}>{group.label}</Text>
      <View style={styles.cards}>
        {group.artworks.map((artwork) => (
          <ArtworkCard
            artwork={artwork}
            key={artwork.id}
            onPress={() => onOpenArtwork(artwork.id)}
          />
        ))}
        {group.unavailableArtworkIds.map((artworkId) => (
          <View accessibilityLabel="Artwork unavailable" key={artworkId} style={styles.card}>
            <View style={[styles.image, styles.unavailableImage]}>
              <Text style={styles.unavailableText}>Artwork unavailable</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function ArtworkCard({
  artwork,
  onPress,
}: {
  artwork: MobileArtworkRecord;
  onPress: () => void;
}) {
  const attribution = artwork.date
    ? `${artwork.artistName} · ${artwork.date}`
    : artwork.artistName;
  return (
    <Pressable
      accessibilityLabel={`Open ${artwork.artworkName} by ${artwork.artistName}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Image
        cachePolicy="memory-disk"
        contentFit="cover"
        source={{
          uri: artwork.resolvedThumbnailUri,
          cacheKey: artwork.thumbnailCacheKey,
        }}
        style={styles.image}
      />
      <View style={styles.caption}>
        <Text numberOfLines={2} style={styles.title}>{artwork.artworkName}</Text>
        <Text numberOfLines={1} style={styles.attribution}>{attribution}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
  },
  label: {
    color: colors.secondary,
    fontSize: typography.caption,
    fontWeight: '600',
  },
  cards: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 140,
    overflow: 'hidden',
    width: '48%',
  },
  pressed: {
    opacity: 0.78,
  },
  image: {
    aspectRatio: 1,
    backgroundColor: colors.border,
    width: '100%',
  },
  caption: {
    gap: 3,
    padding: spacing.sm,
  },
  title: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '600',
  },
  attribution: {
    color: colors.secondary,
    fontSize: typography.caption,
  },
  unavailableImage: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
  },
  unavailableText: {
    color: colors.secondary,
    fontSize: typography.caption,
    textAlign: 'center',
  },
});
