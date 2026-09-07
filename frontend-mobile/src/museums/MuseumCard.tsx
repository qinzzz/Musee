import type { UserMuseumSummary } from '@musee/client-core';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../ui/tokens/theme';

const COPY = { count: (n: number) => `${n} artwork${n === 1 ? '' : 's'} recorded` };
export function MuseumCard({ museum: entry, onPress }: { museum: UserMuseumSummary; onPress: () => void }) {
  const { museum } = entry;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${museum.canonical_name}, ${COPY.count(entry.artwork_count)}`}
    onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
    <View style={styles.media}>{museum.thumbnail_url ?
      <Image source={{ uri: museum.thumbnail_url }} contentFit="cover" cachePolicy="memory-disk" style={styles.image} /> :
      <SymbolView name="building.columns" size={44} tintColor={colors.secondary} />}</View>
    <Text style={styles.name}>{museum.canonical_name}</Text>
    <Text style={styles.secondary}>{COPY.count(entry.artwork_count)}</Text>
    {museum.thumbnail_url && museum.thumbnail_attribution ? <Text style={styles.credit}>{museum.thumbnail_attribution}</Text> : null}
  </Pressable>;
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 24, padding: spacing.md, gap: spacing.sm },
  pressed: { opacity: 0.7 }, media: { height: 180, borderRadius: 16, overflow: 'hidden',
    backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  name: { color: colors.foreground, fontSize: typography.body, fontWeight: '600' },
  secondary: { color: colors.secondary, fontSize: typography.label },
  credit: { color: colors.secondary, fontSize: typography.caption },
});
