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
  mobileArtworkAnalysisService,
  mobileArtworkLibraryService,
} from '../../../api/runtime';
import { ArtworkAnalysisCard } from '../../../capture/components/ArtworkAnalysisCard';
import { MobileArtworkAnalysisError } from '../../../capture/mobileArtworkAnalysisTransport';
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
  const [error, setError] = useState<string | null>(null);

  const loadArtwork = useCallback(async (showRefresh = false) => {
    if (!artworkId) {
      setError(COPY.loadError);
      setLoading(false);
      return;
    }
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setArtwork(await mobileArtworkLibraryService.fetchArtwork(artworkId));
    } catch {
      setError(COPY.loadError);
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
      setError(
        analysisError instanceof MobileArtworkAnalysisError
          ? analysisError.message
          : 'Musee could not analyze this artwork.',
      );
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
        <Text style={styles.error}>{error || COPY.loadError}</Text>
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
              {error || artwork.analysisError || STATUS_COPY[artwork.analysisStatus]}
            </Text>
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
});
