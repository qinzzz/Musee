import { MuseumsPane } from '../museums/MuseumsPane';
import { ArtistsPane } from '../artists/ArtistsPane';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArtworkCollectionPane } from './ArtworkCollectionPane';
import { BoardsScreen } from '../boards/BoardsScreen';
import { GlassIconButton } from '../ui/components/GlassIconButton';
import { Screen } from '../ui/components/Screen';
import { colors, spacing, typography } from '../ui/tokens/theme';

const SECTIONS = [
  { id: 'artworks', label: 'All Artworks' }, { id: 'artists', label: 'Artists' },
  { id: 'museums', label: 'Museums' }, { id: 'boards', label: 'Boards' },
] as const;
type Section = typeof SECTIONS[number]['id'];
const COPY = { upload: 'Upload artwork' };
export function CollectionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState<Section>('artworks');
  useEffect(() => {
    if (params.section === 'boards') setSection('boards');
  }, [params.section]);
  return <Screen>
    <View style={styles.header}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs} contentContainerStyle={styles.labels}>
        {SECTIONS.map((tab) => <Pressable key={tab.id} accessibilityRole="tab"
          accessibilityState={{ selected: section === tab.id }} onPress={() => setSection(tab.id)}
          style={[styles.tab, section === tab.id && styles.active]}>
          <Text style={[styles.label, section === tab.id && styles.activeLabel]}>{tab.label}</Text>
        </Pressable>)}
      </ScrollView>
      <GlassIconButton icon="plus" label={COPY.upload} onPress={() => router.push('/artwork-upload')} />
    </View>
    {section === 'artworks' ? <ArtworkCollectionPane /> : section === 'boards' ? <BoardsScreen /> : section === 'artists' ? <ArtistsPane /> :
      <MuseumsPane />}
  </Screen>;
}
const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  tabs: { flex: 1 }, labels: { gap: spacing.md },
  tab: { minHeight: 46, justifyContent: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  active: { borderColor: colors.foreground },
  label: { fontSize: typography.label, color: colors.secondary, fontWeight: '500' },
  activeLabel: { color: colors.foreground, fontWeight: '600' },
});
