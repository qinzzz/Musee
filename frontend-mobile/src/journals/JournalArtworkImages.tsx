import { useState } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import type { JournalArtworkPreview } from '@musee/client-core';
import { MOBILE_API_BASE_URL } from '../api/runtime';
import { resolveRemoteImageUrl } from '../platform/images/resolveRemoteImageUrl';
import { colors, spacing, typography } from '../ui/tokens/theme';

const COPY = {
  untitled: 'Untitled artwork',
  unknownArtist: 'Artist unknown',
  deleted: 'deleted',
  unavailable: 'image unavailable',
} as const;
const MAX_IMAGES = 2;

export function JournalArtworkImages({ artworks }: { artworks: JournalArtworkPreview[] }) {
  const [failedSources, setFailedSources] = useState<Set<string>>(() => new Set());
  const visible = artworks.filter((artwork) => (
    artwork.is_deleted || !artwork.photo_uri || !failedSources.has(artwork.photo_uri)
  )).slice(0, MAX_IMAGES);
  if (!visible.length) return null;
  const isPair = visible.length === MAX_IMAGES;

  return <View style={[styles.gallery, isPair ? styles.pair : styles.single]}>
    {visible.map((artwork, index) => {
      const title = artwork.artwork_name?.trim() || COPY.untitled;
      const artist = artwork.artist_name?.trim() || COPY.unknownArtist;
      const unavailable = artwork.is_deleted || !artwork.photo_uri;
      const status = artwork.is_deleted ? COPY.deleted : COPY.unavailable;
      return <View key={artwork.id} style={[
        styles.frame, isPair ? styles.pairFrame : styles.singleFrame,
        isPair && (index === 0 ? styles.first : styles.second),
      ]}>
        {unavailable ? <View accessible accessibilityLabel={`${title} by ${artist}, ${status}`}
          style={styles.placeholder}>
          <Text numberOfLines={3} style={styles.title}>{`${title} (${status})`}</Text>
          <Text numberOfLines={2} style={styles.artist}>{artist}</Text>
        </View> : <Image
          accessible accessibilityLabel={`${title} by ${artist}`}
          source={{ uri: resolveRemoteImageUrl(artwork.photo_uri!, MOBILE_API_BASE_URL) }}
          cachePolicy="memory-disk" contentFit="cover" style={styles.image}
          onError={() => setFailedSources((current) => new Set(current).add(artwork.photo_uri!))}
        />}
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  gallery: { width: '100%', maxWidth: 280, marginTop: spacing.sm },
  pair: { aspectRatio: 280 / 190 },
  single: { aspectRatio: 280 / 170 },
  frame: { position: 'absolute', borderWidth: 4, borderColor: colors.surface,
    borderRadius: 12, backgroundColor: colors.border,
    shadowColor: colors.foreground, shadowOpacity: 0.1, shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 } },
  pairFrame: { width: '72%', height: '82%' },
  singleFrame: { width: '100%', height: '100%' },
  first: { left: 0, top: 0 },
  second: { right: 0, bottom: 0 },
  image: { width: '100%', height: '100%', borderRadius: 8 },
  placeholder: { flex: 1, borderRadius: 8, overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center', padding: spacing.sm, gap: spacing.xs },
  title: { color: colors.secondary, fontSize: typography.label, fontWeight: '600', textAlign: 'center' },
  artist: { color: colors.secondary, fontSize: typography.caption, textAlign: 'center' },
});
