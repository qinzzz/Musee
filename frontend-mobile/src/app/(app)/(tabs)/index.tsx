import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { mobileArtworkAnalysisService, mobileArtworkUploadService } from '../../../api/runtime';
import { useAuth } from '../../../auth/AuthProvider';
import { ArtworkAnalysisCard } from '../../../capture/components/ArtworkAnalysisCard';
import { MobileArtworkAnalysisError } from '../../../capture/mobileArtworkAnalysisTransport';
import { MobileArtworkUploadHttpError } from '../../../capture/mobileArtworkUploadTransport';
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
  message: 'Choose a photo to create a pending artwork in your Musee library.',
  choosePhoto: 'Choose from Photos',
  usePhoto: 'Upload to Musee',
  chooseDifferentPhoto: 'Choose a different photo',
  uploadAnother: 'Upload another artwork',
  openLibrary: 'Open Library',
  analyzingHeading: 'Analyzing artwork',
  connectingMessage: 'Musee is preparing the artwork for analysis…',
  receivingMessage: 'Identifying the artist and artwork…',
  analyzedStatus: 'Analysis complete',
  genericError: 'Musee could not upload this artwork. Check your connection and try again.',
  genericAnalysisError: 'Musee could not analyze this artwork. Try the analysis again.',
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
  | { status: 'analysis-error'; artwork: PendingArtworkUpload; message: string }
  | { status: 'upload-error'; asset?: NativeImageAsset; message: string };

function uploadErrorMessage(error: unknown): string {
  if (error instanceof MobileArtworkUploadHttpError) {
    if (error.status === 413 || /too large/i.test(error.detail ?? '')) {
      return 'This photo is too large. Choose an image smaller than 10 MB.';
    }
    return error.detail || COPY.genericError;
  }
  if (error instanceof Error && error.message) return error.message;
  return COPY.genericError;
}

function analysisErrorMessage(error: unknown): string {
  if (error instanceof MobileArtworkAnalysisError) return error.message;
  return COPY.genericAnalysisError;
}

export default function AuthenticatedHomeScreen() {
  const { logout, user } = useAuth();
  const router = useRouter();
  const [capture, setCapture] = useState<CaptureState>({ status: 'idle' });

  const choosePhoto = async () => {
    setCapture({ status: 'picking' });
    try {
      const asset = await pickArtworkImage();
      setCapture(asset ? { status: 'preview', asset } : { status: 'idle' });
    } catch (error) {
      setCapture({ status: 'upload-error', message: uploadErrorMessage(error) });
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
        message: analysisErrorMessage(error),
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
      setCapture({ status: 'upload-error', asset, message: uploadErrorMessage(error) });
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
              label={COPY.choosePhoto}
              loading={capture.status === 'picking'}
              onPress={() => void choosePhoto()}
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
                {capture.message}
              </Text>
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
              {capture.message}
            </Text>
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
  footer: {
    marginTop: 'auto',
    paddingTop: spacing.lg,
  },
});
