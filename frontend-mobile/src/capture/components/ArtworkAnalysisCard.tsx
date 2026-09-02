import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '../../ui/tokens/theme';

type ArtworkAnalysisCardProps = {
  artwork: {
    artistName: string;
    artworkName: string;
    analysis: string;
    date?: string | null;
    medium?: string | null;
    tags: string[];
  };
};

export function ArtworkAnalysisCard({ artwork }: ArtworkAnalysisCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.artist}>{artwork.artistName}</Text>
      <Text style={styles.title}>{artwork.artworkName}</Text>
      {artwork.date || artwork.medium ? (
        <Text style={styles.metadata}>
          {[artwork.date, artwork.medium].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      <Text style={styles.analysis}>{artwork.analysis}</Text>
      {artwork.tags.length > 0 ? (
        <Text style={styles.tags}>{artwork.tags.join('  ')}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.xs,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  artist: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '600',
  },
  title: {
    color: colors.foreground,
    fontSize: typography.heading,
    fontWeight: '600',
  },
  metadata: {
    color: colors.secondary,
    fontSize: typography.caption,
  },
  analysis: {
    color: colors.foreground,
    fontSize: typography.body,
    lineHeight: 24,
    marginTop: spacing.sm,
  },
  tags: {
    color: colors.success,
    fontSize: typography.caption,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
});
