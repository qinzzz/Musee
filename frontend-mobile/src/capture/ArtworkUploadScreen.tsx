import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { ArtworkAnalysisCard } from './components/ArtworkAnalysisCard';
import { ArtworkBatchPanel } from './components/ArtworkBatchPanel';
import { MuseeButton } from '../ui/components/MuseeButton';
import { Screen } from '../ui/components/Screen';
import { colors, radii, spacing, typography } from '../ui/tokens/theme';
import { ARTWORK_UPLOAD_COPY as COPY } from './artworkUploadCopy';
import { useArtworkUpload } from './useArtworkUpload';

export function ArtworkUploadScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { capture, setCapture, choosePhoto, uploadPhoto, analyzeArtwork, runBatch, retryBatchEntry, batchErrorMessage } = useArtworkUpload(user?.user_id || '');
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
            {capture.labelAsset ? <View style={styles.actionGroup}>
              <Image accessibilityLabel={COPY.labelAttached} contentFit="contain"
                source={{ uri: capture.labelAsset.uri }} style={styles.labelPreview} />
              <Text style={styles.message}>{COPY.labelAttached}</Text>
            </View> : null}
            <View style={styles.actionGroup}>
              <MuseeButton
                label={COPY.usePhoto}
                loading={capture.status === 'uploading'}
                onPress={() => void uploadPhoto(capture.asset, capture.labelAsset)}
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
                onPress={() => void uploadPhoto(retryAsset, capture.labelAsset)}
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
  labelPreview: { width: 96, height: 72, borderRadius: radii.input },
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
