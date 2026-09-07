import { useSessionDraft } from './SessionDraftProvider';
import { GlassIconButton } from '../ui/components/GlassIconButton';
import { MAX_SESSION_ATTACHMENTS } from '../session/mobileSessionContextService';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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

import { useAuth } from '../auth/AuthProvider';
import { useCaptureDraft } from '../capture/CaptureDraftProvider';
import { pickArtworkImages } from '../platform/images/pickArtworkImage';
import { SessionArtworkPicker } from '../session/components/SessionArtworkPicker';
import {
  SessionComposer,
  type SessionComposerAttachment,
} from '../session/components/SessionComposer';
import { SessionEventList } from '../session/components/SessionEventList';
import type { MobileSessionArtworkPhase } from '../session/useMobileSessionMessaging';
import { useMobileTextSession } from '../session/useMobileTextSession';
import { MuseeButton } from '../ui/components/MuseeButton';
import { Screen } from '../ui/components/Screen';
import { colors, radii, spacing, typography } from '../ui/tokens/theme';

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

const CONTEXT_STATUS_LABELS = {
  queued: 'Waiting', resolving: 'Saving context…', resolved: 'Saved',
  enriching: 'Preparing context…', ready: 'Ready', failed: 'Needs attention',
} as const;

const COPY = {
  newTitle: 'New Session',
  emptyHeading: 'What are you thinking about?',
  emptyMessage: 'Ask Musee about art, an artist, or something in your collection.',
  retry: 'Try again',
  photoError: 'Musee could not open that photo. Please try again.',
} as const;

export function SessionScreen({ home = false }: { home?: boolean }) {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const routeSessionId = Array.isArray(params.id) ? params.id[0] : params.id;
  const resolvedSessionId = home ? 'new' : routeSessionId || 'new';
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  const sessionDraft = useSessionDraft();
  const { user } = useAuth();
  const { clearDraft, draft } = useCaptureDraft();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [attachments, setAttachments] = useState<SessionComposerAttachment[]>([]);
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);
  const [isPickingLibraryArtwork, setIsPickingLibraryArtwork] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const controller = useMobileTextSession(resolvedSessionId, user?.user_id || '');

  useEffect(() => {
    if (!focused || !draft || draft.destination !== 'session') return;
    setAttachments((current) => [...current, { asset: draft.asset, kind: 'local' } as const].slice(0, MAX_SESSION_ATTACHMENTS));
    setPhotoError(null);
    clearDraft();
  }, [clearDraft, draft, focused]);

  useEffect(() => {
    if (home || resolvedSessionId !== 'new' || !user || !focused || controller.isLoading) return;
    const initial = sessionDraft.take();
    if (!initial) return;
    if (initial.inputs.length) void controller.sendContext(initial.inputs, initial.text);
    else void controller.sendText(initial.text);
  }, [home, resolvedSessionId, user, focused, controller.isLoading, sessionDraft, controller.sendContext, controller.sendText]);

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
    <Screen edges={home ? ['top', 'left', 'right', 'bottom'] : ['left', 'right', 'bottom']}>
      {home ? <View style={styles.homeHeader}>
        <GlassIconButton icon="line.3.horizontal.decrease" label="Session history" onPress={() => router.push('/history')} />
      </View> : <Stack.Screen options={{ title }} />}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={88}
        style={[styles.flex, home && styles.homeBody]}
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
            {home ? <View style={styles.homeEmpty}>
              <Text style={styles.emptyHeading}>{COPY.emptyHeading}</Text>
              <Text style={styles.emptyMessage}>{COPY.emptyMessage}</Text>
            </View> : <ScrollView
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
                <View style={[styles.emptyState, home && styles.homeEmpty]}>
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

              {controller.contextEntries.map((entry) => (
                <View key={entry.id} style={styles.errorCard}>
                  <Text style={styles.processing}>
                    {entry.input.kind === 'library' ? entry.input.artwork.artworkName : entry.input.asset.fileName}
                    {' · '}{CONTEXT_STATUS_LABELS[entry.status]}
                  </Text>
                  {entry.status === 'failed' ? <MuseeButton label={COPY.retry}
                    disabled={controller.isSending}
                    onPress={() => void controller.retryContextEntry(entry.id)} /> : null}
                </View>
              ))}

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
            </ScrollView>}
            <View style={[styles.composerContainer, home && styles.homeComposer]}>
              {photoError ? (
                <Text accessibilityLiveRegion="polite" style={styles.errorText}>
                  {photoError}
                </Text>
              ) : null}
              <SessionComposer
                attachments={attachments}
                disabled={controller.isSending || isPickingPhoto || controller.contextEntries.length > 0}
                onChooseLibraryArtwork={() => {
                  setPhotoError(null);
                  setIsPickingLibraryArtwork(true);
                }}
                onChoosePhoto={() => {
                  setIsPickingPhoto(true);
                  setPhotoError(null);
                  void pickArtworkImages()
                    .then((selection) => {
                      if (!selection) return;
                      setAttachments((current) => {
                        const uris = new Set(current.flatMap((item) => item.kind === 'local' ? [item.asset.uri] : []));
                        const additions = selection.assets.filter((asset) => !uris.has(asset.uri))
                          .map((asset) => ({ kind: 'local' as const, asset }));
                        return [...current, ...additions].slice(0, MAX_SESSION_ATTACHMENTS);
                      });
                      if (selection.rejectedCount || selection.assets.length + attachments.length > MAX_SESSION_ATTACHMENTS) {
                        setPhotoError(`Up to ${MAX_SESSION_ATTACHMENTS} supported photos can be attached. Extra or unsupported photos were omitted.`);
                      }
                    })
                    .catch(() => setPhotoError(COPY.photoError))
                    .finally(() => setIsPickingPhoto(false));
                }}
                onRemoveAttachment={(index) => setAttachments((current) => current.filter((_, i) => i !== index))}
                onSubmit={async (text, selected) => {
                  if (home) {
                    sessionDraft.set({ text, inputs: selected });
                    setAttachments([]);
                    router.push('/session/new');
                    return true;
                  }
                  const submitted = selected.length
                    ? await controller.sendContext(selected, text)
                    : await controller.sendText(text);
                  if (submitted) setAttachments([]);
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
              excludedArtworkIds={attachments.flatMap((entry) => entry.kind === 'library' ? [entry.artwork.id] : [])}
              onCancel={() => setIsPickingLibraryArtwork(false)}
              remainingSlots={MAX_SESSION_ATTACHMENTS - attachments.length}
              onSelect={(artworks) => {
                setAttachments((current) => [...current, ...artworks.map((artwork) => ({ artwork, kind: 'library' } as const))].slice(0, MAX_SESSION_ATTACHMENTS));
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
  homeHeader: { paddingVertical: spacing.sm, alignItems: 'flex-start' },
  homeBody: { justifyContent: 'center', paddingBottom: 96 },
  homeEmpty: { paddingVertical: spacing.lg, gap: spacing.sm },
  homeComposer: { paddingBottom: spacing.lg },

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
