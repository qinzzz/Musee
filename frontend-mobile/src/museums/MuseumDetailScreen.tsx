import { usePullToRefresh } from '../ui/hooks/usePullToRefresh';
import { LoadingIndicator } from '../ui/components/LoadingIndicator';
import { useMemo } from 'react';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { MOBILE_API_BASE_URL, mobileMuseumService } from '../api/runtime';
import { useAuth } from '../auth/AuthProvider';
import { mapMobileArtwork } from '../library/mobileArtworkLibraryService';
import { ArtworkLibraryCard } from '../library/components/ArtworkLibraryCard';
import { Screen } from '../ui/components/Screen';
import { MuseeButton } from '../ui/components/MuseeButton';
import { colors, spacing, typography } from '../ui/tokens/theme';
import { museumKeys, useMuseumRefresh } from './museumQueries';

const COPY = { title: 'Museum', firstRecorded: 'First recorded:', lastRecorded: 'Last recorded:', collection: 'In your collection',
  empty: 'No artworks in your collection yet.', error: 'Musee could not load museum information.',
  unavailable: 'No recorded artworks remain for this museum.', retry: 'Try again' };
export function MuseumDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const userId = user?.user_id ?? '';
  const router = useRouter();
  useMuseumRefresh(userId);
  const profile = useQuery({ queryKey: museumKeys.list(userId),
    queryFn: () => mobileMuseumService.list(userId), enabled: !!userId && !!id });
  const works = useInfiniteQuery({
    queryKey: museumKeys.works(userId, id), initialPageParam: 0,
    queryFn: ({ pageParam }) => mobileMuseumService.artworkPage(id, userId, pageParam),
    enabled: !!userId && !!id,
    getNextPageParam: (last) => {
      const next = last.offset + last.items.length;
      return last.items.length > 0 && next < last.total ? next : undefined;
    },
  });
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (works.data?.pages.flatMap((page) => page.items) ?? []).filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id); return true;
    }).map((item) => mapMobileArtwork(item, MOBILE_API_BASE_URL));
  }, [works.data]);
  const entry = profile.data?.items.find((item) => item.museum.id === id);
  const museum = entry?.museum;
  const missing = profile.isSuccess && !museum;
  const refresh = () => Promise.all([profile.refetch(), works.refetch()]);
  const pullToRefresh = usePullToRefresh(refresh);
  return <Screen edges={['left', 'right', 'bottom']}>
    <Stack.Screen options={{ title: museum?.canonical_name ?? COPY.title }} />
    <FlatList data={items} keyExtractor={(item) => item.id} numColumns={2}
      contentContainerStyle={styles.content} columnWrapperStyle={styles.row}
      {...pullToRefresh}
      onEndReached={() => { if (works.hasNextPage && !works.isFetching) void works.fetchNextPage(); }}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={<View style={styles.header}>
        {profile.isPending ? (works.isPending ? null : <LoadingIndicator />) : museum ? <>
          <View style={styles.identity}>
            <View style={styles.portrait}>{museum.thumbnail_url ?
              <Image source={{ uri: museum.thumbnail_url }} contentFit="cover" style={styles.image} /> :
              <Text style={styles.initial}>{museum.canonical_name[0]?.toUpperCase()}</Text>}</View>
            <View style={styles.identityCopy}><Text style={styles.title}>{museum.canonical_name}</Text>
            </View>
          </View>
          {museum.thumbnail_url && museum.thumbnail_attribution ? <Text style={styles.secondary}>{museum.thumbnail_attribution}</Text> : null}
          {entry?.first_recorded_on ? <Text style={styles.secondary}>{COPY.firstRecorded} {entry.first_recorded_on}</Text> : null}
          {entry?.last_recorded_on ? <Text style={styles.secondary}>{COPY.lastRecorded} {entry.last_recorded_on}</Text> : null}
        </> : null}
        {missing || profile.error || works.error ? <View style={styles.header}>
          <Text accessibilityRole="alert" style={styles.error}>{missing ? COPY.unavailable : COPY.error}</Text>
          {!missing ? <MuseeButton label={COPY.retry} onPress={() => void refresh()} /> : null}
        </View> : null}
        <Text style={styles.section}>{COPY.collection}{works.data ? ` (${works.data.pages[0].total})` : ''}</Text>
      </View>}
      ListEmptyComponent={works.isPending ? <LoadingIndicator /> : !works.error && !missing ? <Text style={styles.secondary}>{COPY.empty}</Text> : null}
      ListFooterComponent={works.isFetchingNextPage ? <LoadingIndicator /> : null}
      renderItem={({ item }) => <View style={styles.item}><ArtworkLibraryCard artwork={item}
        onPress={() => router.push({ pathname: '/artwork/[id]', params: { id: item.id } })} /></View>} />
  </Screen>;
}
const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingVertical: spacing.md }, header: { gap: spacing.md },
  row: { gap: spacing.md }, item: { flex: 1, maxWidth: '48%' },
  identity: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  identityCopy: { flex: 1, gap: spacing.xs },
  portrait: { height: 64, width: 64, borderRadius: 32, overflow: 'hidden', backgroundColor: '#F5F5F5',
    alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' }, initial: { fontSize: 28, color: colors.secondary },
  title: { color: colors.foreground, fontSize: typography.heading, fontWeight: '600' },
  secondary: { color: colors.secondary, fontSize: typography.label },
  section: { color: colors.foreground, fontSize: typography.label, fontWeight: '600', marginTop: spacing.md },
  error: { color: colors.danger, fontSize: typography.label },
});
