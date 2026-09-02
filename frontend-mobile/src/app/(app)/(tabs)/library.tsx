import { useCallback, useRef, useState } from 'react';
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
import {
  presentRequestError,
  type RequestErrorPresentation,
} from '../../../api/requestErrorPresentation';
import { useAuth } from '../../../auth/AuthProvider';
import { ArtworkLibraryCard } from '../../../library/components/ArtworkLibraryCard';
import type { MobileArtworkRecord } from '../../../library/types';
import { MuseeButton } from '../../../ui/components/MuseeButton';
import { Screen } from '../../../ui/components/Screen';
import { colors, spacing, typography } from '../../../ui/tokens/theme';

const PAGE_SIZE = 30;
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
  const router = useRouter();
  const requestVersion = useRef(0);
  const [items, setItems] = useState<MobileArtworkRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<RequestErrorPresentation | null>(null);

  const loadFirstPage = useCallback(async (showRefresh = false) => {
    if (!user) return;
    const version = ++requestVersion.current;
    setError(null);
    if (showRefresh) setRefreshing(true);
    else setInitialLoading(true);
    try {
      const page = await mobileArtworkLibraryService.fetchPage(user.user_id, 0, PAGE_SIZE);
      if (version !== requestVersion.current) return;
      setItems(page.items);
      setTotal(page.total);
    } catch (loadError) {
      if (version === requestVersion.current) setError(presentLibraryError(loadError));
    } finally {
      if (version === requestVersion.current) {
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  }, [user]);

  useFocusEffect(useCallback(() => {
    void loadFirstPage();
    return () => {
      requestVersion.current += 1;
    };
  }, [loadFirstPage]));

  const loadMore = async () => {
    if (!user || initialLoading || refreshing || loadingMore || items.length >= total) return;
    setLoadingMore(true);
    try {
      const page = await mobileArtworkLibraryService.fetchPage(
        user.user_id,
        items.length,
        PAGE_SIZE,
      );
      setItems((current) => {
        const knownIds = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !knownIds.has(item.id))];
      });
      setTotal(page.total);
    } catch (loadError) {
      setError(presentLibraryError(loadError));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Screen>
      <FlatList
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.content}
        data={items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={initialLoading ? (
          <ActivityIndicator color={colors.foreground} style={styles.loading} />
        ) : error ? (
          <View style={styles.messageBlock}>
            <Text style={styles.emptyHeading}>{error.message}</Text>
            {error.technicalDetail ? (
              <Text style={styles.errorDetail}>{error.technicalDetail}</Text>
            ) : null}
            <MuseeButton label={COPY.retry} onPress={() => void loadFirstPage()} />
          </View>
        ) : (
          <View style={styles.messageBlock}>
            <Text style={styles.emptyHeading}>{COPY.emptyHeading}</Text>
            <Text style={styles.emptyMessage}>{COPY.emptyMessage}</Text>
          </View>
        )}
        ListFooterComponent={loadingMore ? (
          <ActivityIndicator color={colors.foreground} style={styles.footerLoading} />
        ) : error && items.length > 0 ? (
          <View style={styles.footerError}>
            <Text style={styles.errorDetail}>{error.message}</Text>
            <MuseeButton label={COPY.retry} onPress={() => void loadFirstPage(true)} />
          </View>
        ) : null}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Text style={styles.brand}>{COPY.brand}</Text>
            <Text style={styles.heading}>{COPY.heading}</Text>
            <Text style={styles.message}>{COPY.message}</Text>
          </View>
        )}
        numColumns={2}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.foreground}
            onRefresh={() => void loadFirstPage(true)}
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
