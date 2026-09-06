import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  MOBILE_API_BASE_URL,
  mobileArtworkLibraryService,
} from '../../../api/runtime';
import { mobileQueryClient } from '../../../api/queryClient';
import {
  presentRequestError,
  type RequestErrorPresentation,
} from '../../../api/requestErrorPresentation';
import { useAuth } from '../../../auth/AuthProvider';
import {
  ARTWORK_LIBRARY_PAGE_SIZE,
  artworkLibraryQueryKey,
  flattenArtworkLibraryPages,
  getNextArtworkPageParam,
} from '../../../library/artworkLibraryQuery';
import { ArtworkLibraryCard } from '../../../library/components/ArtworkLibraryCard';
import {
  getArtworkLibraryScrollOffset,
  setArtworkLibraryScrollOffset,
} from '../../../library/artworkLibraryViewState';
import { MuseeButton } from '../../../ui/components/MuseeButton';
import { Screen } from '../../../ui/components/Screen';
import { colors, spacing, typography } from '../../../ui/tokens/theme';

const COPY = {
  brand: 'Musee',
  heading: 'Library',
  message: 'Your saved artworks and analyses, restored from Musee.',
  emptyHeading: 'No artworks yet',
  emptyMessage: 'Capture or choose a photo to begin your library.',
  error: 'Musee could not load your library.',
  retry: 'Try again',
} as const;

function presentLibraryError(error: unknown): RequestErrorPresentation {
  return presentRequestError(error, {
    apiBaseUrl: MOBILE_API_BASE_URL,
    fallbackMessage: COPY.error,
    showTechnicalDetails: __DEV__,
  });
}

export default function LibraryScreen() {
  const { user } = useAuth();
  const userId = user?.user_id ?? '';
  const router = useRouter();
  const initialContentOffset = useRef({
    x: 0,
    y: getArtworkLibraryScrollOffset(userId),
  }).current;
  const [refreshing, setRefreshing] = useState(false);
  const libraryQuery = useInfiniteQuery<
    Awaited<ReturnType<typeof mobileArtworkLibraryService.fetchPage>>,
    Error,
    InfiniteData<Awaited<ReturnType<typeof mobileArtworkLibraryService.fetchPage>>, number>,
    ReturnType<typeof artworkLibraryQueryKey>,
    number
  >({
    enabled: Boolean(userId),
    getNextPageParam: getNextArtworkPageParam,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => mobileArtworkLibraryService.fetchPage(
      userId,
      pageParam,
      ARTWORK_LIBRARY_PAGE_SIZE,
    ),
    queryKey: artworkLibraryQueryKey(userId),
  });
  const items = useMemo(
    () => flattenArtworkLibraryPages(libraryQuery.data),
    [libraryQuery.data],
  );
  const error: RequestErrorPresentation | null = libraryQuery.error
    ? presentLibraryError(libraryQuery.error)
    : null;

  useFocusEffect(useCallback(() => {
    if (!userId) return;
    void mobileQueryClient.refetchQueries({
      exact: true,
      queryKey: artworkLibraryQueryKey(userId),
      stale: true,
      type: 'active',
    });
  }, [userId]));

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await libraryQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [libraryQuery.refetch]);

  const loadMore = useCallback(() => {
    if (libraryQuery.hasNextPage && !libraryQuery.isFetching) {
      void libraryQuery.fetchNextPage();
    }
  }, [libraryQuery.fetchNextPage, libraryQuery.hasNextPage, libraryQuery.isFetching]);

  return (
    <Screen>
      <FlatList
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.content}
        contentOffset={initialContentOffset}
        data={items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={libraryQuery.isPending ? (
          <ActivityIndicator color={colors.foreground} style={styles.loading} />
        ) : error ? (
          <View style={styles.messageBlock}>
            <Text style={styles.emptyHeading}>{error.message}</Text>
            {error.technicalDetail ? (
              <Text style={styles.errorDetail}>{error.technicalDetail}</Text>
            ) : null}
            <MuseeButton label={COPY.retry} onPress={() => void libraryQuery.refetch()} />
          </View>
        ) : (
          <View style={styles.messageBlock}>
            <Text style={styles.emptyHeading}>{COPY.emptyHeading}</Text>
            <Text style={styles.emptyMessage}>{COPY.emptyMessage}</Text>
          </View>
        )}
        ListFooterComponent={libraryQuery.isFetchingNextPage ? (
          <ActivityIndicator color={colors.foreground} style={styles.footerLoading} />
        ) : error && items.length > 0 ? (
          <View style={styles.footerError}>
            <Text style={styles.errorDetail}>{error.message}</Text>
            <MuseeButton label={COPY.retry} onPress={() => void refresh()} />
          </View>
        ) : null}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text style={styles.brand}>{COPY.brand}</Text>
            <Text style={styles.heading}>{COPY.heading}</Text>
            <Text style={styles.message}>{COPY.message}</Text>
          </View>
        )}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        numColumns={2}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        onScroll={(event) => {
          setArtworkLibraryScrollOffset(userId, event.nativeEvent.contentOffset.y);
        }}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.foreground}
            onRefresh={() => void refresh()}
          />
        )}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <ArtworkLibraryCard
              artwork={item}
              onPress={() => router.push({
                pathname: '/artwork/[id]',
                params: { id: item.id },
              })}
            />
          </View>
        )}
        scrollEventThrottle={250}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: spacing.md,
    paddingBottom: spacing.xl,
    paddingTop: spacing.xl,
  },
  row: {
    gap: spacing.md,
  },
  item: {
    flex: 1,
    maxWidth: '48%',
  },
  header: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  brand: {
    color: colors.foreground,
    fontSize: typography.title,
    fontWeight: '600',
    letterSpacing: -1,
    marginBottom: spacing.sm,
  },
  heading: {
    color: colors.foreground,
    fontSize: typography.heading,
    fontWeight: '600',
  },
  message: {
    color: colors.secondary,
    fontSize: typography.body,
    lineHeight: 24,
  },
  loading: {
    marginTop: spacing.xxl,
  },
  messageBlock: {
    gap: spacing.md,
    paddingVertical: spacing.xxl,
  },
  emptyHeading: {
    color: colors.foreground,
    fontSize: typography.heading,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyMessage: {
    color: colors.secondary,
    fontSize: typography.body,
    lineHeight: 24,
    textAlign: 'center',
  },
  errorDetail: {
    color: colors.secondary,
    fontSize: typography.caption,
    lineHeight: 19,
    textAlign: 'center',
  },
  footerLoading: {
    paddingVertical: spacing.lg,
  },
  footerError: {
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
});
