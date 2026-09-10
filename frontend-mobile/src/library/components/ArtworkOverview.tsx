import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../ui/tokens/theme';
import type { MobileArtworkRecord } from '../types';

export function ArtworkOverview({ artwork, onOpenArtist }: {
  artwork: MobileArtworkRecord;
  onOpenArtist: () => void;
}) {
  return <View style={styles.container}>
    <Text accessibilityRole="header" style={styles.title}>{artwork.artworkName}</Text>
    {artwork.artistEntityId ? <Pressable accessibilityRole="link"
      accessibilityLabel={artwork.artistName} onPress={onOpenArtist}
      style={({ pressed }) => [styles.artistLink, pressed && styles.pressed]}>
      <Text style={[styles.artist, styles.link]}>{artwork.artistName}</Text>
    </Pressable> : <Text style={styles.artist}>{artwork.artistName}</Text>}
    {artwork.date || artwork.medium ? <Text style={styles.medium}>
      {[artwork.date, artwork.medium].filter(Boolean).join(' · ')}
    </Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  title: { color: colors.foreground, fontSize: typography.heading, fontWeight: '600', lineHeight: 32 },
  artist: { color: colors.foreground, fontSize: typography.body, lineHeight: 24 },
  artistLink: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  link: { textDecorationLine: 'underline' },
  pressed: { opacity: 0.6 },
  medium: { color: colors.secondary, fontSize: typography.label, lineHeight: 22 },
});
