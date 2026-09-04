import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '../../ui/tokens/theme';
import type { MobileArtworkRecord } from '../types';

type ArtworkLibraryCardProps = {
  artwork: MobileArtworkRecord;
  disabled?: boolean;
  onPress: () => void;
  statusLabel?: string;
};

const STATUS_LABEL = {
  pending: 'Pending',
  analyzing: 'Analyzing',
  failed: 'Needs attention',
  analyzed: 'Analyzed',
} as const;

export function ArtworkLibraryCard({
  artwork,
  disabled = false,
  onPress,
  statusLabel,
}: ArtworkLibraryCardProps) {
  return (
    <Pressable
      accessibilityLabel={`${artwork.artworkName} by ${artwork.artistName}`}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
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
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.title}>{artwork.artworkName}</Text>
        <Text numberOfLines={1} style={styles.artist}>{artwork.artistName}</Text>
        <Text
          style={[
            styles.status,
            !statusLabel && artwork.analysisStatus === 'failed' && styles.failedStatus,
          ]}
        >
          {statusLabel || STATUS_LABEL[artwork.analysisStatus]}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    overflow: 'hidden',
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.5,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: colors.border,
  },
  copy: {
    gap: 3,
    padding: spacing.sm,
  },
  title: {
    color: colors.foreground,
    fontSize: typography.label,
    fontWeight: '600',
  },
  artist: {
    color: colors.secondary,
    fontSize: typography.caption,
  },
  status: {
    color: colors.success,
    fontSize: typography.caption,
    marginTop: spacing.xs,
  },
  failedStatus: {
    color: colors.danger,
  },
});
