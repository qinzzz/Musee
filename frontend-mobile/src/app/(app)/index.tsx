import { Image } from 'expo-image';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { mobileArtworkUploadService } from '../../api/runtime';
import { useAuth } from '../../auth/AuthProvider';
import { MobileArtworkUploadHttpError } from '../../capture/mobileArtworkUploadTransport';
import type { NativeImageAsset, PendingArtworkUpload } from '../../capture/types';
import { pickArtworkImage } from '../../platform/images/pickArtworkImage';
import { MuseeButton } from '../../ui/components/MuseeButton';
import { Screen } from '../../ui/components/Screen';
import { colors, radii, spacing, typography } from '../../ui/tokens/theme';

const COPY = {
  brand: 'Musee',
  heading: 'Add an artwork',
  message: 'Choose a photo to create a pending artwork in your Musee library.',
  choosePhoto: 'Choose from Photos',
  usePhoto: 'Upload to Musee',
  chooseDifferentPhoto: 'Choose a different photo',
  uploadAnother: 'Upload another artwork',
  uploadedHeading: 'Saved to Musee',
  uploadedMessage: 'The cloud copy is ready for the analysis step.',
  pendingStatus: 'Pending analysis',
  genericError: 'Musee could not upload this artwork. Check your connection and try again.',
  retry: 'Try upload again',
  signOut: 'Sign out',
} as const;

type CaptureState =
  | { status: 'idle' }
  | { status: 'picking' }
  | { status: 'preview'; asset: NativeImageAsset }
  | { status: 'uploading'; asset: NativeImageAsset }
  | { status: 'uploaded'; artwork: PendingArtworkUpload }
  | { status: 'error'; asset?: NativeImageAsset; message: string };

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

export default function AuthenticatedHomeScreen() {
  const { logout, user } = useAuth();
  const [capture, setCapture] = useState<CaptureState>({ status: 'idle' });

  const choosePhoto = async () => {
    setCapture({ status: 'picking' });
    try {
      const asset = await pickArtworkImage();
      setCapture(asset ? { status: 'preview', asset } : { status: 'idle' });
    } catch (error) {
      setCapture({ status: 'error', message: uploadErrorMessage(error) });
    }
  };

  const uploadPhoto = async (asset: NativeImageAsset) => {
    if (!user) return;
    setCapture({ status: 'uploading', asset });
    try {
      const artwork = await mobileArtworkUploadService.uploadArtwork(asset, user.user_id);
      setCapture({ status: 'uploaded', artwork });
    } catch (error) {
      setCapture({ status: 'error', asset, message: uploadErrorMessage(error) });
    }
  };

  const isBusy = capture.status === 'picking' || capture.status === 'uploading';
  const retryAsset = capture.status === 'error' ? capture.asset : undefined;

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

        {capture.status === 'uploaded' ? (
          <View style={styles.captureCard}>
            <Image
              accessibilityLabel="Uploaded artwork"
              cachePolicy="memory-disk"
              contentFit="contain"
              source={{
                uri: capture.artwork.resolvedImageUri,
                cacheKey: capture.artwork.cacheKey,
              }}
              style={styles.previewImage}
            />
            <View style={styles.resultCard}>
              <Text style={styles.resultHeading}>{COPY.uploadedHeading}</Text>
              <Text style={styles.resultMessage}>{COPY.uploadedMessage}</Text>
              <Text style={styles.pendingStatus}>{COPY.pendingStatus}</Text>
            </View>
            <MuseeButton
              label={COPY.uploadAnother}
              onPress={() => setCapture({ status: 'idle' })}
              variant="secondary"
            />
          </View>
        ) : null}

        {capture.status === 'error' ? (
          <View style={styles.errorCard}>
            <Text accessibilityLiveRegion="polite" style={styles.errorMessage}>
              {capture.message}
            </Text>
            {retryAsset ? (
              <MuseeButton
                label={COPY.retry}
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
  pendingStatus: {
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
