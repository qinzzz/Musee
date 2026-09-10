import { LoadingIndicator } from '../../ui/components/LoadingIndicator';
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sessionKeys, sessionListQuery } from '../sessionQueries';
import { useFocusEffect, useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';


import { MOBILE_API_BASE_URL } from '../../api/runtime';
import { useAuth } from '../../auth/AuthProvider';
import { MuseeButton } from '../../ui/components/MuseeButton';
import { colors, spacing, typography } from '../../ui/tokens/theme';
import {
  presentSessionError,
} from '../sessionErrorPresentation';

const COPY = {
  empty: 'Your conversations will appear here.',
  retry: 'Try again',
} as const;

const ERROR_OPTIONS = {
  apiBaseUrl: MOBILE_API_BASE_URL,
  showTechnicalDetails: __DEV__,
};

function formatUpdatedAt(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function SessionHistoryList() {
  const { user } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const userId = user?.user_id || '';
  const query = useQuery(sessionListQuery(userId));
  const sessions = query.data || [];
  const loading = query.isPending;
  const error = query.error ? presentSessionError(query.error, 'load', ERROR_OPTIONS) : null;
  const loadSessions = () => query.refetch();
  useFocusEffect(useCallback(() => {
    if (userId) void client.invalidateQueries({ queryKey: sessionKeys.list(userId) });
  }, [client, userId]));

  return (
    <View style={styles.section}>
      {loading ? (
        <LoadingIndicator color={colors.foreground} />
      ) : error && !sessions.length ? (
        <View style={styles.statusGroup}>
          <Text style={styles.statusText}>{error.message}</Text>
          {error.technicalDetail ? (
            <Text selectable style={styles.technicalText}>{error.technicalDetail}</Text>
          ) : null}
          <MuseeButton label={COPY.retry} onPress={() => void loadSessions()} variant="secondary" />
        </View>
      ) : sessions.length === 0 ? (
        <Text style={styles.statusText}>{COPY.empty}</Text>
      ) : (
        <FlatList
          data={sessions}
          refreshing={query.isRefetching}
          onRefresh={() => void loadSessions()}
          ListHeaderComponent={error ? <View style={styles.statusGroup}>
            <Text style={styles.statusText}>{error.message}</Text>
            <MuseeButton label={COPY.retry} onPress={() => void loadSessions()} />
          </View> : null}
          keyExtractor={(session) => session.id}
          renderItem={({ item: session }) => (
            <Pressable accessibilityRole="button"
              onPress={() => router.push({ pathname: '/session/[id]', params: { id: session.id } })}
              style={({ pressed }) => [styles.sessionRow, pressed && styles.pressed]}>
              <Text numberOfLines={1} style={styles.sessionTitle}>{session.title}</Text>
              <Text style={styles.sessionDate}>{formatUpdatedAt(session.updated_at)}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    flex: 1,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  sessionRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 54,
    paddingHorizontal: spacing.md,
  },
  pressed: {
    opacity: 0.72,
  },
  sessionTitle: {
    color: colors.foreground,
    flex: 1,
    fontSize: typography.label,
    fontWeight: '600',
  },
  sessionDate: {
    color: colors.placeholder,
    fontSize: typography.caption,
  },
  statusGroup: {
    gap: spacing.sm,
  },
  statusText: {
    color: colors.secondary,
    fontSize: typography.label,
    lineHeight: 20,
  },
  technicalText: {
    color: colors.placeholder,
    fontSize: typography.caption,
    lineHeight: 18,
  },
});
