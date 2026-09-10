import { MarkdownText } from '../ui/components/MarkdownText';
import { LoadingIndicator } from '../ui/components/LoadingIndicator';
import { Image } from 'expo-image';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { IdentifyAgainSheet } from './components/IdentifyAgainSheet';
import type { IdentifyAgainHints } from './mobileArtworkLibraryService';
import { ArtworkEditSheet } from './components/ArtworkEditSheet';
import { MuseeButton } from '../ui/components/MuseeButton';
import { Screen } from '../ui/components/Screen';
import { colors, radii, spacing, typography } from '../ui/tokens/theme';
import { ARTWORK_DETAIL_COPY as COPY } from './artworkDetailCopy';
import { useArtworkDetail } from './useArtworkDetail';

const STATUS_COPY = { pending: COPY.pending, analyzing: COPY.analyzing, failed: COPY.failed, analyzed: COPY.analyzed };

export function ArtworkDetailScreen({ artworkId }: { artworkId: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [showIdentify, setShowIdentify] = useState(false);
  const [hints, setHints] = useState<IdentifyAgainHints | null>(null);
  const [editing, setEditing] = useState(false);
  const controller = useArtworkDetail(user?.user_id || '', artworkId, editing || showIdentify);
  const { artwork, loading, refreshing, operation, analyzing, receivedChunk, error,
    actionError, setActionError, loadArtwork, analyzeArtwork } = controller;
  const isFocused = useRef(false);
  useFocusEffect(useCallback(() => {
    isFocused.current = true;
    return () => { isFocused.current = false; };
  }, []));
  const openIdentify = () => {
    if (!artwork || controller.busy) return;
    setHints((current) => current || { artistName: artwork.artistName, artworkName: artwork.artworkName, additionalClue: '' });
    setShowIdentify(true);
  };
  const identifyAgain = async () => {
    if (!hints) return;
    setShowIdentify(false);
    if (await controller.identifyAgain(hints)) setHints(null);
  };
  const deleteArtwork = async () => {
    if (!await controller.deleteArtwork() || !isFocused.current) return;
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/(tabs)/library');
  };
  const confirmDelete = () => Alert.alert(COPY.removeTitle, COPY.removeMessage, [
    { text: COPY.cancel, style: 'cancel' },
    { text: COPY.delete, style: 'destructive', onPress: () => void deleteArtwork() },
  ]);

  if (loading && !artwork) {
    return (
      <Screen contentStyle={styles.centered} edges={['left', 'right', 'bottom']}>
        <LoadingIndicator color={colors.foreground} />
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

  const busy = controller.busy || editing || showIdentify;
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
            setEditing(true);
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
            <MarkdownText>{artwork.analysis}</MarkdownText>
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
        onSave={controller.updateArtwork}
        onSaved={() => {
          setHints(null);
          setEditing(false);
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
