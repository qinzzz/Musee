import { useMemo } from 'react';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { artistLifespan } from '@musee/client-core';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { MOBILE_API_BASE_URL, mobileArtistService } from '../api/runtime';
import { useAuth } from '../auth/AuthProvider';
import { mapMobileArtwork } from '../library/mobileArtworkLibraryService';
import { ArtworkLibraryCard } from '../library/components/ArtworkLibraryCard';
import { Screen } from '../ui/components/Screen';
import { MuseeButton } from '../ui/components/MuseeButton';
import { colors, spacing, typography } from '../ui/tokens/theme';
import { artistKeys, useArtistRefresh } from './artistQueries';

const COPY = { title: 'Artist', noBio: 'No biography available.', collection: 'In your collection',
  empty: 'No artworks in your collection yet.', error: 'Musee could not load artist information.',
  unavailable: 'This artist is no longer available.', retry: 'Try again' };
export function ArtistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const userId = user?.user_id ?? '';
  const router = useRouter();
  useArtistRefresh(userId);
  const profile = useQuery({ queryKey: artistKeys.profile(userId, id),
    queryFn: () => mobileArtistService.profile(id), enabled: !!userId && !!id });
  const works = useInfiniteQuery({
    queryKey: artistKeys.works(userId, id), initialPageParam: 0,
    queryFn: ({ pageParam }) => mobileArtistService.artworkPage(id, userId, pageParam),
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
  const artist = profile.data;
  const missing = profile.error && 'status' in profile.error && profile.error.status === 404;
  const refresh = () => Promise.all([profile.refetch(), works.refetch()]);
  return <Screen edges={['left', 'right', 'bottom']}>
    <Stack.Screen options={{ title: artist?.display_name ?? COPY.title }} />
    <FlatList data={items} keyExtractor={(item) => item.id} numColumns={2}
      contentContainerStyle={styles.content} columnWrapperStyle={styles.row}
      refreshing={profile.isRefetching || works.isRefetching} onRefresh={() => void refresh()}
      onEndReached={() => { if (works.hasNextPage && !works.isFetching) void works.fetchNextPage(); }}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={<View style={styles.header}>
        {profile.isPending ? <ActivityIndicator /> : artist ? <>
          <View style={styles.identity}>
            <View style={styles.portrait}>{artist.profile_image_url ?
              <Image source={{ uri: artist.profile_image_url }} contentFit="cover" style={styles.image} /> :
              <Text style={styles.initial}>{artist.display_name[0]?.toUpperCase()}</Text>}</View>
            <View style={styles.identityCopy}><Text style={styles.title}>{artist.display_name}</Text>
              <Text style={styles.secondary}>{[artist.nationality, artistLifespan(artist)].filter(Boolean).join(' · ')}</Text></View>
          </View>
          {artist.movements?.length ? <View style={styles.chips}>{artist.movements.map((movement) =>
            <Text key={movement} style={styles.chip}>{movement}</Text>)}</View> : null}
          <Text style={styles.bio}>{artist.bio || COPY.noBio}</Text>
        </> : null}
        {profile.error || works.error ? <View style={styles.header}>
          <Text accessibilityRole="alert" style={styles.error}>{missing ? COPY.unavailable : COPY.error}</Text>
          {!missing ? <MuseeButton label={COPY.retry} onPress={() => void refresh()} /> : null}
        </View> : null}
        <Text style={styles.section}>{COPY.collection}{works.data ? ` (${works.data.pages[0].total})` : ''}</Text>
      </View>}
      ListEmptyComponent={works.isPending ? <ActivityIndicator /> : !works.error ? <Text style={styles.secondary}>{COPY.empty}</Text> : null}
      ListFooterComponent={works.isFetchingNextPage ? <ActivityIndicator /> : null}
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
  bio: { color: colors.secondary, fontSize: typography.body, lineHeight: 25 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { color: colors.secondary, fontSize: typography.caption, padding: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderRadius: 9999 },
  section: { color: colors.foreground, fontSize: typography.label, fontWeight: '600', marginTop: spacing.md },
  error: { color: colors.danger, fontSize: typography.label },
});
