import { Image } from 'expo-image';
import { Stack, useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { mobileQueryClient } from '../../../api/queryClient';
import {
  presentRequestError,
  type RequestErrorPresentation,
} from '../../../api/requestErrorPresentation';
import { useAuth } from '../../../auth/AuthProvider';
import { IdentifyAgainSheet } from '../../../library/components/IdentifyAgainSheet';
import {
  invalidateArtworkLibraryQuery,
  removeArtworkFromLibraryQuery,
  updateArtworkLibraryQuery,
} from '../../../library/artworkLibraryQuery';
import type { IdentifyAgainHints } from '../../../library/mobileArtworkLibraryService';
import { ArtworkEditSheet } from '../../../library/components/ArtworkEditSheet';
import { presentArtworkAnalysisError } from '../../../capture/captureErrorPresentation';
import { toPendingArtworkUpload } from '../../../library/mobileArtworkLibraryService';
import type { MobileArtworkRecord } from '../../../library/types';
import { MuseeButton } from '../../../ui/components/MuseeButton';
import { showPendingToast, showToast } from '../../../ui/toast';
import { Screen } from '../../../ui/components/Screen';
import { colors, radii, spacing, typography } from '../../../ui/tokens/theme';

const COPY = {
  edit: 'Edit',
  actions: 'Artwork actions', identify: 'Identify Again', delete: 'Delete', cancel: 'Cancel',
  removeTitle: 'Remove Artwork?', removeMessage: 'Remove this artwork from your collection?',
  reidentifying: 'Re-identifying artwork…', deleting: 'Removing artwork…',
  identifyError: 'Could not identify the artwork again.', deleteError: 'Could not remove artwork.',
  savedRefreshError: 'Identification finished, but the updated artwork could not be loaded. Refresh to see it.',
  identified: 'Artwork identified again', updated: 'Artwork updated', removed: 'Removed from collection',
  identifyingToast: 'Identifying artwork again…',
  deletingToast: 'Deleting artwork…', analyzingToast: 'Analyzing artwork…',
  analysis: 'Analysis',
  movement: 'Movement',
  period: 'Period',
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
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.user_id;
  const operationLock = useRef(false);
  const isFocused = useRef(false);
  const [operation, setOperation] = useState<'identify' | 'delete' | null>(null);
  const [actionError, setActionError] = useState<{ message: string; action: 'identify' | 'delete' | 'refresh' } | null>(null);
  const [showIdentify, setShowIdentify] = useState(false);
  const [hints, setHints] = useState<IdentifyAgainHints | null>(null);
  const requestVersion = useRef(0);
  const [editing, setEditing] = useState(false);
  const [artwork, setArtwork] = useState<MobileArtworkRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [receivedChunk, setReceivedChunk] = useState(false);
  const [error, setError] = useState<RequestErrorPresentation | null>(null);

  const loadArtwork = useCallback(async (showRefresh = false) => {
    if (operationLock.current) return;
    const version = ++requestVersion.current;
    if (!artworkId) {
      setError({ message: COPY.loadError });
      setLoading(false);
      return;
    }
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const loaded = await mobileArtworkLibraryService.fetchArtwork(artworkId);
      if (version === requestVersion.current) {
        setArtwork(loaded);
        if (userId) updateArtworkLibraryQuery(mobileQueryClient, userId, loaded);
      }
    } catch (loadError) {
      if (version === requestVersion.current) setError(presentArtworkLoadError(loadError));
    } finally {
      if (version === requestVersion.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [artworkId, userId]);

  useFocusEffect(useCallback(() => {
    isFocused.current = true;
    void loadArtwork();
    return () => { isFocused.current = false; requestVersion.current += 1; };
  }, [loadArtwork]));

  const analyzeArtwork = async () => {
    if (!artwork || operationLock.current || analyzing) return;
    setAnalyzing(true);
    setReceivedChunk(false);
    setError(null);
    showPendingToast({ label: COPY.analyzingToast });
    try {
      await mobileArtworkAnalysisService.analyzeArtwork(
        toPendingArtworkUpload(artwork),
        () => setReceivedChunk(true),
      );
      await loadArtwork();
      if (userId) invalidateArtworkLibraryQuery(mobileQueryClient, userId);
      showToast({ label: COPY.analyzed, icon: 'sparkles' });
    } catch (analysisError) {
      await loadArtwork();
      const presentation = presentArtworkAnalysisError(
        analysisError,
        ERROR_PRESENTATION_OPTIONS,
      );
      setError(presentation);
      showToast({
        label: presentation.message,
        icon: 'exclamationmark',
        tone: 'danger',
        durationMs: 4000,
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const openIdentify = () => {
    if (!artwork || operationLock.current) return;
    setHints((current) => current || {
      artistName: artwork.artistName, artworkName: artwork.artworkName, additionalClue: '',
    });
    setShowIdentify(true);
  };

  const identifyAgain = async () => {
    if (!artwork || !hints || operationLock.current || !Object.values(hints).some((value) => value.trim())) return;
    operationLock.current = true;
    requestVersion.current += 1;
    setRefreshing(false);
    setOperation('identify');
    setActionError(null);
    setError(null);
    setShowIdentify(false);
    showPendingToast({ label: COPY.identifyingToast });
    let completed = false;
    try {
      await mobileArtworkLibraryService.identifyAgain(artwork.id, hints);
      completed = true;
      setHints(null);
      const identified = await mobileArtworkLibraryService.fetchArtwork(artwork.id);
      setArtwork(identified);
      if (userId) updateArtworkLibraryQuery(mobileQueryClient, userId, identified);
      if (userId) invalidateArtworkLibraryQuery(mobileQueryClient, userId);
      showToast({ label: COPY.identified, icon: 'viewfinder' });
    } catch (cause) {
      const presentation = completed
        ? { message: COPY.savedRefreshError }
        : presentRequestError(cause, {
          ...ERROR_PRESENTATION_OPTIONS, fallbackMessage: COPY.identifyError,
        });
      setActionError({
        action: completed ? 'refresh' : 'identify',
        message: presentation.message,
      });
      showToast({
        label: presentation.message,
        icon: 'exclamationmark',
        tone: 'danger',
        durationMs: 4000,
      });
      if (!completed) {
        // The request can fail after the server has persisted a result or failure.
        try { setArtwork(await mobileArtworkLibraryService.fetchArtwork(artwork.id)); } catch { /* Keep the last loaded record. */ }
      }
    } finally {
      operationLock.current = false;
      setOperation(null);
    }
  };

  const deleteArtwork = async () => {
    if (!artwork || !userId || operationLock.current) return;
    operationLock.current = true;
    requestVersion.current += 1;
    setRefreshing(false);
    setOperation('delete');
    setActionError(null);
    showPendingToast({ label: COPY.deletingToast });
    try {
      await mobileArtworkLibraryService.deleteArtwork(artwork.id, userId);
      removeArtworkFromLibraryQuery(mobileQueryClient, userId, artwork.id);
      showToast({ label: COPY.removed, icon: 'trash' });
      if (!isFocused.current) return;
      if (router.canGoBack()) router.back();
      else router.replace('/(app)/(tabs)/library');
    } catch (cause) {
      const presentation = presentRequestError(cause, {
        ...ERROR_PRESENTATION_OPTIONS, fallbackMessage: COPY.deleteError,
      });
      setActionError({ action: 'delete', message: presentation.message });
      showToast({
        label: presentation.message,
        icon: 'exclamationmark',
        tone: 'danger',
        durationMs: 4000,
      });
    } finally {
      operationLock.current = false;
      setOperation(null);
    }
  };

  const confirmDelete = () => Alert.alert(COPY.removeTitle, COPY.removeMessage, [
    { text: COPY.cancel, style: 'cancel' },
    { text: COPY.delete, style: 'destructive', onPress: () => void deleteArtwork() },
  ]);

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

  const busy = Boolean(operation) || analyzing || editing || showIdentify;
  const actionsDisabled = busy || artwork.analysisStatus === 'analyzing' || artwork.isDeleted;
  const canAnalyze = artwork.analysisStatus === 'pending' || artwork.analysisStatus === 'failed';
  const analysisButtonLabel = artwork.analysisStatus === 'failed'
    ? COPY.retryAnalysis
    : COPY.analyze;

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel={COPY.actions} disabled={actionsDisabled}>
          <Stack.Toolbar.MenuAction icon="viewfinder" onPress={openIdentify}>{COPY.identify}</Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="pencil" onPress={() => {
            requestVersion.current += 1; setRefreshing(false); setEditing(true);
          }}>{COPY.edit}</Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="trash" destructive disabled={!user} onPress={confirmDelete}>{COPY.delete}</Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.foreground}
            onRefresh={() => { if (!busy) void loadArtwork(true); }}
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
          {operation ? (operation === 'identify' ? COPY.reidentifying : COPY.deleting) : analyzing
            ? (receivedChunk ? COPY.receiving : COPY.connecting)
            : STATUS_COPY[artwork.analysisStatus]}
        </Text>

        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{artwork.artworkName}</Text>
          {artwork.artistEntityId ? <Text accessibilityRole="link" style={[styles.stateMessage, { textDecorationLine: 'underline' }]}
            onPress={() => router.push({ pathname: '/artist/[id]', params: { id: artwork.artistEntityId! } })}>
            {artwork.artistName}
          </Text> : <Text style={styles.stateMessage}>{artwork.artistName}</Text>}
          {artwork.date || artwork.medium ? <Text style={styles.stateMessage}>
            {[artwork.date, artwork.medium].filter(Boolean).join(' · ')}
          </Text> : null}
          {artwork.movement ? <Text style={styles.stateMessage}>{COPY.movement}: {artwork.movement}</Text> : null}
          {artwork.periodBucket ? <Text style={styles.stateMessage}>{COPY.period}: {artwork.periodBucket}</Text> : null}
          {artwork.tags.length ? <Text style={styles.stateMessage}>{artwork.tags.join('  ')}</Text> : null}
        </View>
        {actionError ? (
          <View style={styles.stateCard}>
            <Text accessibilityRole="alert" style={styles.error}>{actionError.message}</Text>
            <MuseeButton disabled={busy} label={actionError.action === 'identify' ? COPY.identify : COPY.retryLoad}
              onPress={() => {
                if (actionError.action === 'identify') openIdentify();
                else if (actionError.action === 'delete') confirmDelete();
                else { setActionError(null); void loadArtwork(true); }
              }} />
          </View>
        ) : null}
        {error ? (
          <View style={styles.stateCard}>
            <Text accessibilityRole="alert" style={styles.error}>{error.message}</Text>
            <MuseeButton label={COPY.retryLoad} onPress={() => void loadArtwork(true)} />
          </View>
        ) : null}
        {artwork.analysis ? (
          <View style={styles.stateCard}>
            <Text accessibilityRole="header" style={styles.stateTitle}>{COPY.analysis}</Text>
            <Text selectable style={styles.analysis}>{artwork.analysis}</Text>
          </View>
        ) : null}
        {!artwork.analysis || artwork.analysisStatus !== 'analyzed' ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>{artwork.artworkName}</Text>
            <Text style={styles.stateMessage}>
              {error?.message || artwork.analysisError || STATUS_COPY[artwork.analysisStatus]}
            </Text>
            {error?.technicalDetail ? (
              <Text style={styles.errorDetail}>{error.technicalDetail}</Text>
            ) : null}
            {canAnalyze && !actionError && !operation ? (
              <MuseeButton
                label={analysisButtonLabel}
                loading={analyzing}
                disabled={busy}
                onPress={() => void analyzeArtwork()}
              />
            ) : null}
            {artwork.analysisStatus === 'analyzing' && !busy ? (
              <MuseeButton
                label={COPY.refreshStatus}
                onPress={() => void loadArtwork(true)}
                variant="secondary"
              />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      {showIdentify && hints ? <IdentifyAgainSheet values={hints} onChange={setHints}
        onClose={() => setShowIdentify(false)} onSubmit={() => void identifyAgain()} /> : null}
      {editing ? <ArtworkEditSheet artwork={artwork} onClose={() => setEditing(false)}
        onSaved={(saved) => {
          requestVersion.current += 1;
          setArtwork(saved);
          if (userId) updateArtworkLibraryQuery(mobileQueryClient, userId, saved);
          if (userId) invalidateArtworkLibraryQuery(mobileQueryClient, userId);
          setHints(null);
          setActionError(null);
          setError(null);
          setEditing(false);
          showToast({ label: COPY.updated, icon: 'pencil' });
        }} /> : null}
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
  analysis: {
    color: colors.foreground,
    fontSize: typography.body,
    lineHeight: 27,
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
