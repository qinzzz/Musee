import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { SessionChatPhase } from '@musee/client-core';

import { useAuth } from '../../../auth/AuthProvider';
import { SessionComposer } from '../../../session/components/SessionComposer';
import { SessionEventList } from '../../../session/components/SessionEventList';
import { useMobileTextSession } from '../../../session/useMobileTextSession';
import { MuseeButton } from '../../../ui/components/MuseeButton';
import { Screen } from '../../../ui/components/Screen';
import { colors, radii, spacing, typography } from '../../../ui/tokens/theme';

const PHASE_LABELS: Record<SessionChatPhase, string> = {
  planning: 'Preparing response…',
  retrieving_collection: 'Searching your collection…',
  generating_response: 'Writing response…',
};

const COPY = {
  newTitle: 'New Session',
  emptyHeading: 'What are you thinking about?',
  emptyMessage: 'Ask Musee about art, an artist, or something in your collection.',
  retry: 'Try again',
} as const;

export default function MobileSessionScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const routeSessionId = Array.isArray(params.id) ? params.id[0] : params.id;
  const resolvedSessionId = routeSessionId || 'new';
  const { user } = useAuth();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const controller = useMobileTextSession(resolvedSessionId, user?.user_id || '');

  useEffect(() => {
    if (
      resolvedSessionId === 'new'
      && controller.session
      && !controller.isSending
      && !controller.failure
    ) {
      router.replace({
        pathname: '/session/[id]',
        params: { id: controller.session.id },
      });
    }
  }, [
    controller.failure,
    controller.isSending,
    controller.session,
    resolvedSessionId,
    router,
  ]);

  if (!user) return null;

  const title = controller.session?.title || COPY.newTitle;
  const processingLabel = controller.phase
    ? PHASE_LABELS[controller.phase]
    : controller.isSending
      ? 'Saving your message…'
      : null;
  const showGlobalFailure = controller.failure
    && controller.failure.stage !== 'stream';

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={88}
        style={styles.flex}
      >
        {controller.isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.foreground} />
          </View>
        ) : controller.loadError ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{controller.loadError.message}</Text>
            {controller.loadError.technicalDetail ? (
              <Text style={styles.technicalDetail}>
                {controller.loadError.technicalDetail}
              </Text>
            ) : null}
            <MuseeButton label={COPY.retry} onPress={() => void controller.reload()} />
          </View>
        ) : (
          <>
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
              ref={scrollRef}
              showsVerticalScrollIndicator={false}
            >
              {controller.events.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyHeading}>{COPY.emptyHeading}</Text>
                  <Text style={styles.emptyMessage}>{COPY.emptyMessage}</Text>
                </View>
              ) : (
                <SessionEventList
                  artworks={controller.artworks}
                  events={controller.events}
                  onOpenArtwork={(artworkId) => {
                    router.push({
                      pathname: '/artwork/[id]',
                      params: { id: artworkId },
                    });
                  }}
                  onRetryResponse={(eventId) => {
                    void controller.retryFailedResponse(eventId);
                  }}
                />
              )}

              {processingLabel ? (
                <Text accessibilityLiveRegion="polite" style={styles.processing}>
                  {processingLabel}
                </Text>
              ) : null}

              {controller.failure?.stage === 'stream'
                && controller.failure.technicalDetail ? (
                  <Text style={styles.technicalDetail}>
                    {controller.failure.technicalDetail}
                  </Text>
                ) : null}

              {showGlobalFailure ? (
                <View style={styles.errorCard}>
                  <Text accessibilityLiveRegion="polite" style={styles.errorText}>
                    {controller.failure?.message}
                  </Text>
                  {controller.failure?.technicalDetail ? (
                    <Text style={styles.technicalDetail}>
                      {controller.failure.technicalDetail}
                    </Text>
                  ) : null}
                  <MuseeButton
                    label={COPY.retry}
                    onPress={() => void controller.retryLastFailure()}
                    variant="secondary"
                  />
                </View>
              ) : null}
            </ScrollView>
            <View style={styles.composerContainer}>
              <SessionComposer
                disabled={controller.isSending}
                onSubmit={controller.sendText}
              />
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centered: {
    alignItems: 'stretch',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    gap: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 360,
    paddingHorizontal: spacing.lg,
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
  processing: {
    color: colors.secondary,
    fontSize: typography.label,
    lineHeight: 20,
    paddingHorizontal: spacing.xs,
  },
  composerContainer: {
    paddingBottom: spacing.sm,
    paddingTop: spacing.sm,
  },
  errorCard: {
    borderColor: colors.danger,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
    padding: spacing.md,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.label,
    lineHeight: 20,
    textAlign: 'center',
  },
  technicalDetail: {
    color: colors.secondary,
    fontSize: typography.caption,
    lineHeight: 19,
    textAlign: 'center',
  },
});
