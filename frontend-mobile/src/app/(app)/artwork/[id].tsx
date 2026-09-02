import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  MOBILE_API_BASE_URL,
  mobileArtworkAnalysisService,
  mobileArtworkLibraryService,
} from '../../../api/runtime';
import {
  presentRequestError,
  type RequestErrorPresentation,
} from '../../../api/requestErrorPresentation';
import { ArtworkAnalysisCard } from '../../../capture/components/ArtworkAnalysisCard';
import { presentArtworkAnalysisError } from '../../../capture/captureErrorPresentation';
import { toPendingArtworkUpload } from '../../../library/mobileArtworkLibraryService';
import type { MobileArtworkRecord } from '../../../library/types';
import { MuseeButton } from '../../../ui/components/MuseeButton';
import { Screen } from '../../../ui/components/Screen';
import { colors, radii, spacing, typography } from '../../../ui/tokens/theme';

const COPY = {
  loadError: 'Musee could not load this artwork.',
  retryLoad: 'Try again',
  analyze: 'Analyze artwork',
  retryAnalysis: 'Try analysis again',
  refreshStatus: 'Refresh status',
  connecting: 'Preparing the artwork for analysis…',
  receiving: 'Identifying the artist and artwork…',
  pending: 'Pending analysis',
  analyzing: 'Analysis in progress',
  failed: 'Analysis needs attention',
  analyzed: 'Analysis complete',
} as const;

const ERROR_PRESENTATION_OPTIONS = {
  apiBaseUrl: MOBILE_API_BASE_URL,
  showTechnicalDetails: __DEV__,
};

function presentArtworkLoadError(error: unknown): RequestErrorPresentation {
  return presentRequestError(error, {
    ...ERROR_PRESENTATION_OPTIONS,
    fallbackMessage: COPY.loadError,
  });
}

const STATUS_COPY = {
  pending: COPY.pending,
  analyzing: COPY.analyzing,
  failed: COPY.failed,
  analyzed: COPY.analyzed,
} as const;

export default function ArtworkDetailScreen() {
  const params = useLocalSearchParams<{ id: string | string[] }>();
  const artworkId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [artwork, setArtwork] = useState<MobileArtworkRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [receivedChunk, setReceivedChunk] = useState(false);
  const [error, setError] = useState<RequestErrorPresentation | null>(null);

  const loadArtwork = useCallback(async (showRefresh = false) => {
    if (!artworkId) {
      setError({ message: COPY.loadError });
      setLoading(false);
      return;
    }
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setArtwork(await mobileArtworkLibraryService.fetchArtwork(artworkId));
    } catch (loadError) {
      setError(presentArtworkLoadError(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [artworkId]);

  useFocusEffect(useCallback(() => {
    void loadArtwork();
  }, [loadArtwork]));

  const analyzeArtwork = async () => {
    if (!artwork) return;
    setAnalyzing(true);
    setReceivedChunk(false);
    setError(null);
    try {
      await mobileArtworkAnalysisService.analyzeArtwork(
        toPendingArtworkUpload(artwork),
        () => setReceivedChunk(true),
      );
      await loadArtwork();
    } catch (analysisError) {
      await loadArtwork();
      setError(presentArtworkAnalysisError(
        analysisError,
        ERROR_PRESENTATION_OPTIONS,
      ));
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading && !artwork) {
    return (
      <Screen contentStyle={styles.centered} edges={['left', 'right', 'bottom']}>
        <ActivityIndicator color={colors.foreground} />
      </Screen>
    );
  }

  if (!artwork) {
    return (
      <Screen contentStyle={styles.centered} edges={['left', 'right', 'bottom']}>
        <Text style={styles.error}>{error?.message || COPY.loadError}</Text>
        {error?.technicalDetail ? (
          <Text style={styles.errorDetail}>{error.technicalDetail}</Text>
        ) : null}
        <MuseeButton label={COPY.retryLoad} onPress={() => void loadArtwork()} />
      </Screen>
    );
  }

  const canAnalyze = artwork.analysisStatus === 'pending' || artwork.analysisStatus === 'failed';
  const analysisButtonLabel = artwork.analysisStatus === 'failed'
    ? COPY.retryAnalysis
    : COPY.analyze;

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.foreground}
            onRefresh={() => void loadArtwork(true)}
          />
        )}
        showsVerticalScrollIndicator={false}
      >
        <Image
          accessibilityLabel={`${artwork.artworkName} by ${artwork.artistName}`}
          cachePolicy="memory-disk"
          contentFit="contain"
          source={{ uri: artwork.resolvedImageUri, cacheKey: artwork.cacheKey }}
          style={styles.image}
        />

        <Text
          style={[
            styles.status,
            artwork.analysisStatus === 'failed' && styles.failedStatus,
          ]}
        >
          {analyzing
            ? (receivedChunk ? COPY.receiving : COPY.connecting)
            : STATUS_COPY[artwork.analysisStatus]}
        </Text>

        {artwork.analysisStatus === 'analyzed' && artwork.analysis ? (
          <ArtworkAnalysisCard artwork={{ ...artwork, analysis: artwork.analysis }} />
        ) : (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>{artwork.artworkName}</Text>
            <Text style={styles.stateMessage}>
              {error?.message || artwork.analysisError || STATUS_COPY[artwork.analysisStatus]}
            </Text>
            {error?.technicalDetail ? (
              <Text style={styles.errorDetail}>{error.technicalDetail}</Text>
            ) : null}
            {canAnalyze ? (
              <MuseeButton
                label={analysisButtonLabel}
                loading={analyzing}
                onPress={() => void analyzeArtwork()}
              />
            ) : null}
            {artwork.analysisStatus === 'analyzing' && !analyzing ? (
              <MuseeButton
                label={COPY.refreshStatus}
                onPress={() => void loadArtwork(true)}
                variant="secondary"
              />
            ) : null}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: spacing.md,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
  status: {
    color: colors.success,
    fontSize: typography.caption,
    fontWeight: '600',
  },
  failedStatus: {
    color: colors.danger,
  },
  stateCard: {
    gap: spacing.md,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  stateTitle: {
    color: colors.foreground,
    fontSize: typography.heading,
    fontWeight: '600',
  },
  stateMessage: {
    color: colors.secondary,
    fontSize: typography.body,
    lineHeight: 24,
  },
  error: {
    color: colors.danger,
    fontSize: typography.body,
    lineHeight: 24,
    textAlign: 'center',
  },
  errorDetail: {
    color: colors.secondary,
    fontSize: typography.caption,
    lineHeight: 19,
    textAlign: 'center',
  },
});
