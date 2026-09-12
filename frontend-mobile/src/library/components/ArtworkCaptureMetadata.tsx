import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../ui/tokens/theme';
import { artworkCaptureDetails } from '../artworkCapturePresentation';
import type { MobileArtworkRecord } from '../types';

const MUSEUM_LABEL = 'Location';

export function ArtworkCaptureMetadata({ artwork }: { artwork: MobileArtworkRecord }) {
  const details = artworkCaptureDetails(artwork);
  return <View style={styles.container}>
    {[{ label: MUSEUM_LABEL, value: details.museum }, { label: details.timeLabel, value: details.time }].map(({ label, value }) => (
      <View key={label} style={styles.row} accessible accessibilityLabel={`${label}: ${value}`}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
    ))}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, paddingVertical: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: spacing.md, rowGap: spacing.xs },
  label: { color: colors.secondary, fontSize: typography.caption, lineHeight: 22, flexBasis: 88 },
  value: { color: colors.foreground, fontSize: typography.label, lineHeight: 22, flexGrow: 1, flexShrink: 1, flexBasis: 170 },
});
