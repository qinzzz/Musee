import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  MOBILE_API_BASE_URL,
  mobileArtworkAnalysisService,
  mobileArtworkUploadService,
} from '../../../api/runtime';
import type { RequestErrorPresentation } from '../../../api/requestErrorPresentation';
import { useAuth } from '../../../auth/AuthProvider';
import { ArtworkAnalysisCard } from '../../../capture/components/ArtworkAnalysisCard';
import { useCaptureDraft } from '../../../capture/CaptureDraftProvider';
import {
  presentArtworkAnalysisError,
  presentArtworkUploadError,
} from '../../../capture/captureErrorPresentation';
import type {
  AnalyzedArtwork,
  NativeImageAsset,
  PendingArtworkUpload,
} from '../../../capture/types';
import { pickArtworkImage } from '../../../platform/images/pickArtworkImage';
import { MuseeButton } from '../../../ui/components/MuseeButton';
import { Screen } from '../../../ui/components/Screen';
import { colors, radii, spacing, typography } from '../../../ui/tokens/theme';

const COPY = {
  brand: 'Musee',
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
  signOut: 'Sign out',
} as const;

type CaptureState =
  | { status: 'idle' }
  | { status: 'picking' }
  | { status: 'preview'; asset: NativeImageAsset }
  | { status: 'uploading'; asset: NativeImageAsset }
  | { status: 'analyzing'; artwork: PendingArtworkUpload; receivedChunk: boolean }
  | { status: 'analyzed'; artwork: AnalyzedArtwork }
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

export default function AuthenticatedHomeScreen() {
  const { logout, user } = useAuth();
  const { clearDraft, draft } = useCaptureDraft();
  const router = useRouter();
  const [capture, setCapture] = useState<CaptureState>({ status: 'idle' });

  useEffect(() => {
    if (!draft) return;
    setCapture({ status: 'preview', asset: draft });
    clearDraft();
  }, [clearDraft, draft]);

  const choosePhoto = async () => {
    setCapture({ status: 'picking' });
    try {
      const asset = await pickArtworkImage();
      setCapture(asset ? { status: 'preview', asset } : { status: 'idle' });
    } catch (error) {
      setCapture({
        status: 'upload-error',
        error: presentArtworkUploadError(error, ERROR_PRESENTATION_OPTIONS),
      });
    }
  };

  const analyzeArtwork = async (artwork: PendingArtworkUpload) => {
    setCapture({ status: 'analyzing', artwork, receivedChunk: false });
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
    } catch (error) {
      setCapture({
        status: 'analysis-error',
        artwork,
        error: presentArtworkAnalysisError(error, ERROR_PRESENTATION_OPTIONS),
      });
    }
  };

  const uploadPhoto = async (asset: NativeImageAsset) => {
    if (!user) return;
    setCapture({ status: 'uploading', asset });
    try {
      const artwork = await mobileArtworkUploadService.uploadArtwork(asset, user.user_id);
      await analyzeArtwork(artwork);
    } catch (error) {
      setCapture({
        status: 'upload-error',
        asset,
        error: presentArtworkUploadError(error, ERROR_PRESENTATION_OPTIONS),
      });
    }
  };

  const isBusy = (
    capture.status === 'picking'
    || capture.status === 'uploading'
    || capture.status === 'analyzing'
  );
  const retryAsset = capture.status === 'upload-error' ? capture.asset : undefined;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.brand}>{COPY.brand}</Text>
          <Text style={styles.heading}>{COPY.heading}</Text>
          <Text style={styles.message}>{COPY.message}</Text>
        </View>

        {capture.status === 'idle' || capture.status === 'picking' ? (
          <View style={styles.actionGroup}>
            <MuseeButton
              disabled={capture.status === 'picking'}
              label={COPY.takePhoto}
              onPress={() => router.push('/camera')}
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
              onPress={() => router.navigate('/library')}
              variant="secondary"
            />
          </View>
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

        <View style={styles.footer}>
          <MuseeButton
            disabled={isBusy}
            label={COPY.signOut}
            onPress={() => void logout()}
            variant="secondary"
          />
        </View>
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
  brand: {
    color: colors.foreground,
    fontSize: typography.title,
    fontWeight: '600',
    letterSpacing: -1,
    marginBottom: spacing.md,
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
  footer: {
    marginTop: 'auto',
    paddingTop: spacing.lg,
  },
});
