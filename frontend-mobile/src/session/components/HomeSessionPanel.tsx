import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { SessionRecord } from '@musee/client-core';

import { MOBILE_API_BASE_URL, mobileSessionService } from '../../api/runtime';
import { useAuth } from '../../auth/AuthProvider';
import { MuseeButton } from '../../ui/components/MuseeButton';
import { colors, radii, spacing, typography } from '../../ui/tokens/theme';
import {
  presentSessionError,
  type SessionErrorPresentation,
} from '../sessionErrorPresentation';

const COPY = {
  heading: 'Sessions',
  message: 'Ask Musee a question and return to the conversation anytime.',
  start: 'Start Session',
  recent: 'Recent Sessions',
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

export function HomeSessionPanel() {
  const { user } = useAuth();
  const router = useRouter();
  const requestVersion = useRef(0);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<SessionErrorPresentation | null>(null);

  const loadSessions = useCallback(async () => {
    if (!user) return;
    const version = ++requestVersion.current;
    setLoading(true);
    setError(null);
    try {
      const records = await mobileSessionService.fetchSessions(user.user_id);
      if (version === requestVersion.current) setSessions(records);
    } catch (loadError) {
      if (version === requestVersion.current) {
        setError(presentSessionError(loadError, 'load', ERROR_OPTIONS));
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => {
    void loadSessions();
    return () => {
      requestVersion.current += 1;
    };
  }, [loadSessions]));

  return (
    <View style={styles.section}>
      <View style={styles.headingGroup}>
        <Text style={styles.heading}>{COPY.heading}</Text>
        <Text style={styles.message}>{COPY.message}</Text>
      </View>
      <MuseeButton
        label={COPY.start}
        onPress={() => router.push('/session/new')}
      />

      <Text style={styles.recentLabel}>{COPY.recent}</Text>
      {loading ? (
        <ActivityIndicator color={colors.foreground} />
      ) : error ? (
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
        <View style={styles.sessionList}>
          {sessions.slice(0, 4).map((session) => (
            <Pressable
              accessibilityRole="button"
              key={session.id}
              onPress={() => router.push({
                pathname: '/session/[id]',
                params: { id: session.id },
              })}
              style={({ pressed }) => [styles.sessionRow, pressed && styles.pressed]}
            >
              <Text numberOfLines={1} style={styles.sessionTitle}>{session.title}</Text>
              <Text style={styles.sessionDate}>{formatUpdatedAt(session.updated_at)}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  headingGroup: {
    gap: spacing.xs,
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
  recentLabel: {
    color: colors.secondary,
    fontSize: typography.caption,
    fontWeight: '600',
    marginTop: spacing.xs,
    textTransform: 'uppercase',
  },
  sessionList: {
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
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
