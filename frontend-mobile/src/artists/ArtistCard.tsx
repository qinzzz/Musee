import type { ArtistRow } from '@musee/client-core';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MOBILE_API_BASE_URL, mobileArtistService } from '../api/runtime';
import { mapMobileArtwork } from '../library/mobileArtworkLibraryService';
import { colors, spacing, typography } from '../ui/tokens/theme';
import { artistKeys } from './artistQueries';

const COPY = { count: (n: number) => `${n} work${n === 1 ? '' : 's'}` };
export function ArtistCard({ artist, userId, onPress }: { artist: ArtistRow; userId: string; onPress: () => void }) {
  const preview = useQuery({
    queryKey: artistKeys.preview(userId, artist.id),
    queryFn: () => mobileArtistService.artworkPage(artist.id, userId, 0, 3),
    enabled: !!userId,
  });
  const works = (preview.data?.items ?? []).map((item) => mapMobileArtwork(item, MOBILE_API_BASE_URL));
  const image = (index: number) => <Image source={{ uri: works[index].resolvedThumbnailUri }}
    contentFit="cover" cachePolicy="memory-disk" style={styles.workImage} />;
  return <Pressable accessibilityRole="button" accessibilityLabel={artist.display_name} onPress={onPress}
    style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
    <View style={styles.media}>
      <View style={styles.portrait}>
        {artist.profile_image_url ? <Image source={{ uri: artist.profile_image_url }} contentFit="cover" style={styles.workImage} /> :
          <Text style={styles.initial}>{artist.display_name[0]?.toUpperCase()}</Text>}
      </View>
      <View style={styles.cluster}>
        {works.length === 0 ? <View style={styles.blank} /> :
          works.length === 1 ? <View style={styles.work}>{image(0)}</View> :
          works.length === 2 ? <><View style={styles.work}>{image(0)}</View><View style={styles.work}>{image(1)}</View></> :
          <><View style={styles.top}>{image(0)}</View><View style={styles.bottom}>
            <View style={styles.work}>{image(1)}</View><View style={styles.work}>{image(2)}</View>
          </View></>}
      </View>
    </View>
    <View style={styles.caption}><Text numberOfLines={1} style={styles.name}>{artist.display_name}</Text>
      <Text style={styles.count}>{COPY.count(artist.artwork_count)}</Text></View>
  </Pressable>;
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 24, padding: 12, gap: 12 },
  pressed: { opacity: 0.7 },
  media: { flexDirection: 'row', height: 200, gap: 10 },
  portrait: { flex: 0.92, borderRadius: 20, overflow: 'hidden', backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  cluster: { flex: 1.08, gap: 6 },
  work: { flex: 1, borderRadius: 18, overflow: 'hidden', backgroundColor: '#F5F5F5' },
  top: { flex: 1.2, borderRadius: 18, overflow: 'hidden' },
  bottom: { flex: 0.9, flexDirection: 'row', gap: 6 },
  blank: { flex: 1, backgroundColor: '#F5F5F5', borderRadius: 18 },
  workImage: { width: '100%', height: '100%' },
  initial: { fontSize: 36, fontWeight: '600', color: colors.placeholder },
  caption: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flex: 1, color: colors.foreground, fontWeight: '600', fontSize: typography.label },
  count: { color: colors.secondary, fontSize: typography.caption },
});
