import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  MOBILE_API_BASE_URL,
  mobileArtworkAnalysisService,
  mobileArtworkBatchService,
  mobileArtworkUploadService,
} from '../../api/runtime';
import { mobileQueryClient } from '../../api/queryClient';
import type { RequestErrorPresentation } from '../../api/requestErrorPresentation';
import { useAuth } from '../../auth/AuthProvider';
import { ArtworkAnalysisCard } from '../../capture/components/ArtworkAnalysisCard';
import { ArtworkBatchPanel } from '../../capture/components/ArtworkBatchPanel';
import { useCaptureDraft } from '../../capture/CaptureDraftProvider';
import {
  presentArtworkAnalysisError,
  presentArtworkUploadError,
} from '../../capture/captureErrorPresentation';
import type {
  AnalyzedArtwork,
  NativeImageAsset,
  PendingArtworkUpload,
} from '../../capture/types';
import type { MobileArtworkBatchEntry } from '../../capture/mobileArtworkBatchService';
import { pickArtworkImages } from '../../platform/images/pickArtworkImage';
import { invalidateArtworkLibraryQuery } from '../../library/artworkLibraryQuery';
import { MuseeButton } from '../../ui/components/MuseeButton';
import { Screen } from '../../ui/components/Screen';
import { showPendingToast, showToast } from '../../ui/toast';
import { colors, radii, spacing, typography } from '../../ui/tokens/theme';

const COPY = {
  heading: 'Add an artwork',
  message: 'Photograph an artwork or choose one from Photos to add it to your Musee library.',
  takePhoto: 'Take a Photo',
  choosePhoto: 'Choose from Photos',
  usePhoto: 'Upload to Musee',
  chooseDifferentPhoto: 'Choose a different photo',
  uploadAnother: 'Upload another artwork',
  openLibrary: 'Open Library',
  analyzingHeading: 'Analyzing artwork',
  connectingMessage: 'Musee is preparing the artwork for analysis…',
  receivingMessage: 'Identifying the artist and artwork…',
  analyzedStatus: 'Analysis complete',
  retryUpload: 'Try upload again',
  retryAnalysis: 'Try analysis again',
  uploadingToast: 'Uploading artwork…',
  analyzingToast: 'Analyzing artwork…',
  analyzedToast: 'Artwork analysis complete',
  rejectedPhotos: 'Some selected photos could not be prepared.',
  noUsablePhotos: 'Musee could not prepare the selected photos. Choose different images.',
  batchFailed: 'Musee could not add the selected artworks.',
} as const;

type CaptureState =
  | { status: 'idle' }
  | { status: 'picking' }
  | { status: 'preview'; asset: NativeImageAsset }
  | { status: 'uploading'; asset: NativeImageAsset }
  | { status: 'analyzing'; artwork: PendingArtworkUpload; receivedChunk: boolean }
  | { status: 'analyzed'; artwork: AnalyzedArtwork }
  | { status: 'batch'; entries: MobileArtworkBatchEntry[]; running: boolean }
  | {
    status: 'analysis-error';
    artwork: PendingArtworkUpload;
    error: RequestErrorPresentation;
  }
  | {
    status: 'upload-error';
    asset?: NativeImageAsset;
    error: RequestErrorPresentation;
  };

const ERROR_PRESENTATION_OPTIONS = {
  apiBaseUrl: MOBILE_API_BASE_URL,
  showTechnicalDetails: __DEV__,
};

export default function ArtworkUploadScreen() {
  const { user } = useAuth();
  const { clearDraft, draft } = useCaptureDraft();
  const router = useRouter();
  const [capture, setCapture] = useState<CaptureState>({ status: 'idle' });

  useEffect(() => {
    if (!draft || draft.destination !== 'library') return;
    setCapture({ status: 'preview', asset: draft.asset });
    clearDraft();
  }, [clearDraft, draft]);

  const choosePhoto = async () => {
    setCapture({ status: 'picking' });
    try {
      const selection = await pickArtworkImages();
      if (!selection) {
        setCapture({ status: 'idle' });
        return;
      }
      if (selection.rejectedCount > 0) {
        showToast({ label: COPY.rejectedPhotos, icon: 'exclamationmark', tone: 'neutral' });
      }
      if (selection.assets.length === 0) {
        setCapture({ status: 'upload-error', error: { message: COPY.noUsablePhotos } });
      } else if (selection.assets.length === 1) {
        setCapture({ status: 'preview', asset: selection.assets[0] });
      } else {
        setCapture({
          status: 'batch',
          entries: mobileArtworkBatchService.createEntries(selection.assets),
          running: false,
        });
      }
    } catch (error) {
      setCapture({
        status: 'upload-error',
        error: presentArtworkUploadError(error, ERROR_PRESENTATION_OPTIONS),
      });
    }
  };

  const batchErrorMessage = (entry: MobileArtworkBatchEntry): string => (
    entry.status === 'upload_failed'
      ? presentArtworkUploadError(entry.error, ERROR_PRESENTATION_OPTIONS).message
      : presentArtworkAnalysisError(entry.error, ERROR_PRESENTATION_OPTIONS).message
  );

  const runBatch = async (entries: MobileArtworkBatchEntry[]) => {
    if (!user || entries.length === 0) return;
    setCapture({ status: 'batch', entries, running: true });
    showPendingToast({ label: `Uploading artwork 1 of ${entries.length}…` });
    const completed = await mobileArtworkBatchService.process(
      entries,
      user.user_id,
      (entry, index, nextEntries) => {
        setCapture({ status: 'batch', entries: nextEntries, running: true });
        if (entry.status === 'uploading') {
          showPendingToast({ label: `Uploading artwork ${index + 1} of ${entries.length}…` });
        } else if (entry.status === 'uploaded') {
          invalidateArtworkLibraryQuery(mobileQueryClient, user.user_id);
        } else if (entry.status === 'analyzing') {
          showPendingToast({ label: `Analyzing artwork ${index + 1} of ${entries.length}…` });
        }
      },
    );
    setCapture({ status: 'batch', entries: completed, running: false });
    invalidateArtworkLibraryQuery(mobileQueryClient, user.user_id);
    const savedCount = completed.filter((entry) => Boolean(entry.persisted)).length;
    const analysisFailureCount = completed.filter(
      (entry) => entry.status === 'analysis_failed',
    ).length;
    if (savedCount === entries.length && analysisFailureCount === 0) {
      showToast({
        label: `Added ${savedCount} artworks to your Library`,
        icon: 'photo.stack',
      });
    } else if (savedCount > 0) {
      showToast({
        label: savedCount === entries.length
          ? `Added ${savedCount} artworks; ${analysisFailureCount} need analysis`
          : `Added ${savedCount} of ${entries.length} artworks`,
        icon: 'exclamationmark',
        tone: 'neutral',
        durationMs: 4000,
      });
    } else {
      showToast({
        label: COPY.batchFailed,
        icon: 'exclamationmark',
        tone: 'danger',
        durationMs: 4000,
      });
    }
  };

  const retryBatchEntry = async (
    entries: MobileArtworkBatchEntry[],
    entryId: string,
  ) => {
    if (!user) return;
    const entryIndex = entries.findIndex((entry) => entry.id === entryId);
    const entry = entries[entryIndex];
    if (!entry) return;
    setCapture({ status: 'batch', entries, running: true });
    showPendingToast({
      label: entry.persisted ? 'Analyzing artwork again…' : 'Uploading artwork again…',
    });
    const retried = await mobileArtworkBatchService.retry(
      entry,
      user.user_id,
      (nextEntry) => {
        setCapture((current) => current.status === 'batch' ? {
          ...current,
          entries: current.entries.map((item) => item.id === entryId ? nextEntry : item),
          running: true,
        } : current);
        if (nextEntry.status === 'uploaded') {
          invalidateArtworkLibraryQuery(mobileQueryClient, user.user_id);
        }
      },
    );
    const nextEntries = entries.map((item) => item.id === entryId ? retried : item);
    setCapture({ status: 'batch', entries: nextEntries, running: false });
    invalidateArtworkLibraryQuery(mobileQueryClient, user.user_id);
    if (retried.status === 'complete') {
      showToast({ label: 'Artwork added to your Library', icon: 'checkmark' });
    } else {
      showToast({
        label: batchErrorMessage(retried),
        icon: 'exclamationmark',
        tone: 'danger',
        durationMs: 4000,
      });
    }
  };

  const analyzeArtwork = async (artwork: PendingArtworkUpload) => {
    setCapture({ status: 'analyzing', artwork, receivedChunk: false });
    showPendingToast({ label: COPY.analyzingToast });
    try {
      const analyzed = await mobileArtworkAnalysisService.analyzeArtwork(
        artwork,
        () => setCapture((current) => (
          current.status === 'analyzing'
            ? { ...current, receivedChunk: true }
            : current
        )),
      );
      setCapture({ status: 'analyzed', artwork: analyzed });
      showToast({ label: COPY.analyzedToast, icon: 'sparkles' });
    } catch (error) {
      const presentation = presentArtworkAnalysisError(error, ERROR_PRESENTATION_OPTIONS);
      setCapture({
        status: 'analysis-error',
        artwork,
        error: presentation,
      });
      showToast({
        label: presentation.message,
        icon: 'exclamationmark',
        tone: 'danger',
        durationMs: 4000,
      });
    }
  };

  const uploadPhoto = async (asset: NativeImageAsset) => {
    if (!user) return;
    setCapture({ status: 'uploading', asset });
    showPendingToast({ label: COPY.uploadingToast });
    try {
      const artwork = await mobileArtworkUploadService.uploadArtwork(asset, user.user_id);
      invalidateArtworkLibraryQuery(mobileQueryClient, user.user_id);
      await analyzeArtwork(artwork);
    } catch (error) {
      const presentation = presentArtworkUploadError(error, ERROR_PRESENTATION_OPTIONS);
      setCapture({
        status: 'upload-error',
        asset,
        error: presentation,
      });
      showToast({
        label: presentation.message,
        icon: 'exclamationmark',
        tone: 'danger',
        durationMs: 4000,
      });
    }
  };

  const retryAsset = capture.status === 'upload-error' ? capture.asset : undefined;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Add Artworks' }} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.heading}>{COPY.heading}</Text>
          <Text style={styles.message}>{COPY.message}</Text>
        </View>

        {capture.status === 'idle' || capture.status === 'picking' ? (
          <View style={styles.actionGroup}>
            <MuseeButton
              disabled={capture.status === 'picking'}
              label={COPY.takePhoto}
              onPress={() => router.push({
                pathname: '/camera',
                params: { destination: 'library' },
              })}
            />
            <MuseeButton
              label={COPY.choosePhoto}
              loading={capture.status === 'picking'}
              onPress={() => void choosePhoto()}
              variant="secondary"
            />
          </View>
        ) : null}

        {capture.status === 'preview' || capture.status === 'uploading' ? (
          <View style={styles.captureCard}>
            <Image
              accessibilityLabel="Selected artwork"
              contentFit="contain"
              source={{ uri: capture.asset.uri }}
              style={styles.previewImage}
            />
            <View style={styles.actionGroup}>
              <MuseeButton
                label={COPY.usePhoto}
                loading={capture.status === 'uploading'}
                onPress={() => void uploadPhoto(capture.asset)}
              />
              <MuseeButton
                disabled={capture.status === 'uploading'}
                label={COPY.chooseDifferentPhoto}
                onPress={() => void choosePhoto()}
                variant="secondary"
              />
            </View>
          </View>
        ) : null}

        {capture.status === 'analyzing' ? (
          <View style={styles.captureCard}>
            <Image
              accessibilityLabel="Artwork being analyzed"
              cachePolicy="memory-disk"
              contentFit="contain"
              source={{
                uri: capture.artwork.resolvedImageUri,
                cacheKey: capture.artwork.cacheKey,
              }}
              style={styles.previewImage}
            />
            <View style={styles.resultCard}>
              <Text style={styles.resultHeading}>{COPY.analyzingHeading}</Text>
              <Text accessibilityLiveRegion="polite" style={styles.resultMessage}>
                {capture.receivedChunk ? COPY.receivingMessage : COPY.connectingMessage}
              </Text>
            </View>
          </View>
        ) : null}

        {capture.status === 'analyzed' ? (
          <View style={styles.captureCard}>
            <Image
              accessibilityLabel="Analyzed artwork"
              cachePolicy="memory-disk"
              contentFit="contain"
              source={{
                uri: capture.artwork.resolvedImageUri,
                cacheKey: capture.artwork.cacheKey,
              }}
              style={styles.previewImage}
            />
            <Text style={styles.completedStatus}>{COPY.analyzedStatus}</Text>
            <ArtworkAnalysisCard artwork={capture.artwork} />
            <MuseeButton
              label={COPY.uploadAnother}
              onPress={() => setCapture({ status: 'idle' })}
              variant="secondary"
            />
            <MuseeButton
              label={COPY.openLibrary}
              onPress={() => router.back()}
              variant="secondary"
            />
          </View>
        ) : null}

        {capture.status === 'batch' ? (
          <ArtworkBatchPanel
            entries={capture.entries}
            getErrorMessage={batchErrorMessage}
            running={capture.running}
            onOpenLibrary={() => router.back()}
            onRemove={(entryId) => {
              const remaining = capture.entries.filter((entry) => entry.id !== entryId);
              setCapture(remaining.length > 0
                ? { status: 'batch', entries: remaining, running: false }
                : { status: 'idle' });
            }}
            onReset={() => setCapture({ status: 'idle' })}
            onRetry={(entryId) => void retryBatchEntry(capture.entries, entryId)}
            onStart={() => void runBatch(capture.entries)}
          />
        ) : null}

        {capture.status === 'analysis-error' ? (
          <View style={styles.captureCard}>
            <Image
              accessibilityLabel="Artwork awaiting analysis retry"
              cachePolicy="memory-disk"
              contentFit="contain"
              source={{
                uri: capture.artwork.resolvedImageUri,
                cacheKey: capture.artwork.cacheKey,
              }}
              style={styles.previewImage}
            />
            <View style={styles.errorCard}>
              <Text accessibilityLiveRegion="polite" style={styles.errorMessage}>
                {capture.error.message}
              </Text>
              {capture.error.technicalDetail ? (
                <Text style={styles.errorDetail}>{capture.error.technicalDetail}</Text>
              ) : null}
              <MuseeButton
                label={COPY.retryAnalysis}
                onPress={() => void analyzeArtwork(capture.artwork)}
              />
            </View>
          </View>
        ) : null}

        {capture.status === 'upload-error' ? (
          <View style={styles.errorCard}>
            <Text accessibilityLiveRegion="polite" style={styles.errorMessage}>
              {capture.error.message}
            </Text>
            {capture.error.technicalDetail ? (
              <Text style={styles.errorDetail}>{capture.error.technicalDetail}</Text>
            ) : null}
            {retryAsset ? (
              <MuseeButton
                label={COPY.retryUpload}
                onPress={() => void uploadPhoto(retryAsset)}
              />
            ) : null}
            <MuseeButton
              label={COPY.chooseDifferentPhoto}
              onPress={() => void choosePhoto()}
              variant="secondary"
            />
          </View>
        ) : null}

      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    gap: spacing.xl,
    paddingBottom: spacing.xl,
    paddingTop: spacing.xxl,
  },
  header: {
    gap: spacing.sm,
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
  captureCard: {
    gap: spacing.md,
  },
  previewImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
  actionGroup: {
    gap: spacing.sm,
  },
  resultCard: {
    gap: spacing.xs,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  resultHeading: {
    color: colors.foreground,
    fontSize: typography.body,
    fontWeight: '600',
  },
  resultMessage: {
    color: colors.secondary,
    fontSize: typography.label,
    lineHeight: 20,
  },
  completedStatus: {
    color: colors.success,
    fontSize: typography.caption,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  errorCard: {
    gap: spacing.sm,
    borderColor: colors.danger,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  errorMessage: {
    color: colors.danger,
    fontSize: typography.label,
    lineHeight: 20,
  },
  errorDetail: {
    color: colors.secondary,
    fontSize: typography.caption,
    lineHeight: 19,
  },
});
