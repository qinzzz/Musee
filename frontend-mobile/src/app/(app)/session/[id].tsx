import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { useCaptureDraft } from '../../../capture/CaptureDraftProvider';
import { pickArtworkImage } from '../../../platform/images/pickArtworkImage';
import { SessionArtworkPicker } from '../../../session/components/SessionArtworkPicker';
import {
  SessionComposer,
  type SessionComposerAttachment,
} from '../../../session/components/SessionComposer';
import { SessionEventList } from '../../../session/components/SessionEventList';
import type { MobileSessionArtworkPhase } from '../../../session/useMobileSessionMessaging';
import { useMobileTextSession } from '../../../session/useMobileTextSession';
import { MuseeButton } from '../../../ui/components/MuseeButton';
import { Screen } from '../../../ui/components/Screen';
import { colors, radii, spacing, typography } from '../../../ui/tokens/theme';

const PHASE_LABELS: Record<SessionChatPhase, string> = {
  planning: 'Preparing response…',
  retrieving_collection: 'Searching your collection…',
  generating_response: 'Writing response…',
};

const ARTWORK_PHASE_LABELS: Record<MobileSessionArtworkPhase, string> = {
  analyzing_artwork: 'Looking at the artwork…',
  saving_artwork_input: 'Adding artwork to Session…',
  starting_session: 'Starting Session…',
  uploading_artwork: 'Uploading artwork…',
};

const COPY = {
  newTitle: 'New Session',
  emptyHeading: 'What are you thinking about?',
  emptyMessage: 'Ask Musee about art, an artist, or something in your collection.',
  retry: 'Try again',
  photoError: 'Musee could not open that photo. Please try again.',
} as const;

export default function MobileSessionScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const routeSessionId = Array.isArray(params.id) ? params.id[0] : params.id;
  const resolvedSessionId = routeSessionId || 'new';
  const { user } = useAuth();
  const { clearDraft, draft } = useCaptureDraft();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [attachment, setAttachment] = useState<SessionComposerAttachment | null>(null);
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);
  const [isPickingLibraryArtwork, setIsPickingLibraryArtwork] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const controller = useMobileTextSession(resolvedSessionId, user?.user_id || '');

  useEffect(() => {
    if (!draft || draft.destination !== 'session') return;
    setAttachment({ asset: draft.asset, kind: 'local' });
    setPhotoError(null);
    clearDraft();
  }, [clearDraft, draft]);

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
  const processingLabel = controller.artworkPhase
    ? ARTWORK_PHASE_LABELS[controller.artworkPhase]
    : controller.phase
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
        ) : controller.loadError && !controller.session ? (
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
              {controller.loadError ? (
                <View style={styles.centered}>
                  <Text accessibilityRole="alert" style={styles.errorText}>{controller.loadError.message}</Text>
                  <MuseeButton label={COPY.retry} disabled={controller.isSending} onPress={() => void controller.reload()} />
                </View>
              ) : null}
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
              {photoError ? (
                <Text accessibilityLiveRegion="polite" style={styles.errorText}>
                  {photoError}
                </Text>
              ) : null}
              <SessionComposer
                attachment={attachment}
                disabled={controller.isSending || isPickingPhoto}
                onChooseLibraryArtwork={() => {
                  setPhotoError(null);
                  setIsPickingLibraryArtwork(true);
                }}
                onChoosePhoto={() => {
                  setIsPickingPhoto(true);
                  setPhotoError(null);
                  void pickArtworkImage()
                    .then((asset) => {
                      if (asset) setAttachment({ asset, kind: 'local' });
                    })
                    .catch(() => setPhotoError(COPY.photoError))
                    .finally(() => setIsPickingPhoto(false));
                }}
                onRemoveAttachment={() => setAttachment(null)}
                onSubmit={async (text, selectedArtwork) => {
                  const submitted = selectedArtwork?.kind === 'local'
                    ? await controller.sendArtwork(selectedArtwork.asset, text)
                    : selectedArtwork?.kind === 'library'
                      ? await controller.sendLibraryArtwork(selectedArtwork.artwork, text)
                      : await controller.sendText(text);
                  if (submitted && selectedArtwork) setAttachment(null);
                  return submitted;
                }}
                onTakePhoto={() => {
                  setPhotoError(null);
                  router.push({
                    pathname: '/camera',
                    params: { destination: 'session' },
                  });
                }}
              />
            </View>
            <SessionArtworkPicker
              excludedArtworkIds={controller.artworks.map((artwork) => artwork.id)}
              onCancel={() => setIsPickingLibraryArtwork(false)}
              onSelect={(artwork) => {
                setAttachment({ artwork, kind: 'library' });
                setIsPickingLibraryArtwork(false);
              }}
              userId={user.user_id}
              visible={isPickingLibraryArtwork}
            />
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
