import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MOBILE_API_BASE_URL, mobileArtworkAnalysisService, mobileArtworkLibraryService } from '../api/runtime';
import { presentRequestError, type RequestErrorPresentation } from '../api/requestErrorPresentation';
import { presentArtworkAnalysisError } from '../capture/captureErrorPresentation';
import { toPendingArtworkUpload, type ArtworkMetadataUpdates, type IdentifyAgainHints } from './mobileArtworkLibraryService';
import { artworkDetailKey, artworkDetailQuery, cacheArtwork } from './artworkQueries';
import { artworkLibraryQueryKey, invalidateArtworkLibraryQuery, removeArtworkFromLibraryQuery } from './artworkLibraryQuery';
import { showPendingToast, showToast, hideToast } from '../ui/toast';
import { ARTWORK_DETAIL_COPY as COPY } from './artworkDetailCopy';
import type { CaptureLocationUpdate } from '@musee/client-core';
import { museumKeys } from '../museums/museumQueries';

type Operation = 'analyze' | 'identify' | 'delete' | 'edit';
type ActionError = { message: string; action: 'identify' | 'delete' | 'refresh' };
const ERROR_OPTIONS = { apiBaseUrl: MOBILE_API_BASE_URL, showTechnicalDetails: __DEV__ };

export function useArtworkDetail(userId: string, artworkId: string, paused = false) {
  const client = useQueryClient();
  const [operation, setOperation] = useState<Operation | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const [analysisError, setAnalysisError] = useState<RequestErrorPresentation | null>(null);
  const [receivedChunk, setReceivedChunk] = useState(false);
  const owner = `${userId}:${artworkId}`;
  const identity = useRef(owner);
  identity.current = owner;
  const mounted = useRef(true);
  const lock = useRef<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    lock.current = null;
    setOperation(null); setActionError(null); setAnalysisError(null);
    return () => {
      mounted.current = false;
      if (lock.current === owner) hideToast();
    };
  }, [owner]);
  const current = () => mounted.current && identity.current === owner;
  const query = useQuery({ ...artworkDetailQuery(userId, artworkId), enabled: !!userId && !!artworkId && !operation && !paused });
  const key = artworkDetailKey(userId, artworkId);
  useFocusEffect(useCallback(() => {
    if (userId && artworkId) void client.invalidateQueries({ queryKey: artworkDetailKey(userId, artworkId) });
  }, [client, userId, artworkId]));

  useEffect(() => {
    if (paused) void client.cancelQueries({ queryKey: artworkDetailKey(userId, artworkId), exact: true });
  }, [client, userId, artworkId, paused]);

  const cancelReads = () => Promise.all([
    client.cancelQueries({ queryKey: key, exact: true }),
    client.cancelQueries({ queryKey: artworkLibraryQueryKey(userId), exact: true }),
  ]);
  async function refreshSavedArtwork() {
    const saved = await mobileArtworkLibraryService.fetchArtwork(artworkId);
    await cancelReads();
    if (current()) cacheArtwork(client, userId, saved);
    return saved;
  }
  async function run<T>(kind: Operation, label: string, work: () => Promise<T>) {
    if (!userId || !artworkId || lock.current === owner) return undefined;
    lock.current = owner;
    setOperation(kind); setActionError(null); setAnalysisError(null);
    showPendingToast({ label });
    try {
      await cancelReads();
      if (!current()) return undefined;
      return await work();
    } finally {
      if (current()) { lock.current = null; setOperation(null); }
    }
  }
  const loadArtwork = async (_showRefresh = false) => {
    if (lock.current === owner) return;
    setAnalysisError(null); setActionError(null);
    await query.refetch();
  };
  return {
    artwork: query.data ?? null,
    loading: query.isPending,
    refreshing: query.isRefetching,
    operation: operation === 'identify' || operation === 'delete' ? operation : null,
    busy: !!operation,
    analyzing: operation === 'analyze', receivedChunk, actionError, setActionError,
    error: analysisError || (query.error ? presentRequestError(query.error, { ...ERROR_OPTIONS, fallbackMessage: COPY.loadError }) : null),
    loadArtwork,
    updateLocation: (update: CaptureLocationUpdate) => run('edit', COPY.saving, async () => {
      try {
        const saved = await mobileArtworkLibraryService.updateLocation(artworkId, update);
        await cancelReads();
        if (!current()) return undefined;
        cacheArtwork(client, userId, saved);
        void client.invalidateQueries({ queryKey: museumKeys.all(userId) });
        showToast({ label: COPY.locationUpdated, icon: 'mappin' });
        return saved;
      } catch (cause) {
        if (current()) showToast({ label: COPY.locationSaveError, tone: 'danger', icon: 'exclamationmark' });
        throw cause;
      }
    }),
    analyzeArtwork: () => run('analyze', COPY.analyzingToast, async () => {
      if (!query.data) return;
      setReceivedChunk(false);
      try {
        await mobileArtworkAnalysisService.analyzeArtwork(toPendingArtworkUpload(query.data), () => { if (current()) setReceivedChunk(true); });
        if (!current()) return;
        await refreshSavedArtwork();
        if (current()) showToast({ label: COPY.analyzed, icon: 'sparkles' });
      } catch (cause) {
        if (!current()) return;
        try { await refreshSavedArtwork(); } catch { /* Keep the saved record and original failure. */ }
        if (!current()) return;
        const error = presentArtworkAnalysisError(cause, ERROR_OPTIONS);
        setAnalysisError(error);
        showToast({ label: error.message, tone: 'danger', icon: 'exclamationmark', durationMs: 4000 });
      } finally { if (current()) invalidateArtworkLibraryQuery(client, userId); }
    }),
    identifyAgain: (hints: IdentifyAgainHints) => run('identify', COPY.identifyingToast, async () => {
      let completed = false;
      try {
        await mobileArtworkLibraryService.identifyAgain(artworkId, hints);
        completed = true;
        if (!current()) return false;
        await refreshSavedArtwork();
        if (!current()) return false;
        showToast({ label: COPY.identified, icon: 'viewfinder' });
        return true;
      } catch (cause) {
        if (!current()) return false;
        const error = completed ? { message: COPY.savedRefreshError }
          : presentRequestError(cause, { ...ERROR_OPTIONS, fallbackMessage: COPY.identifyError });
        setActionError({ ...error, action: completed ? 'refresh' : 'identify' });
        showToast({ label: error.message, tone: 'danger', icon: 'exclamationmark', durationMs: 4000 });
        return completed;
      } finally { if (current()) invalidateArtworkLibraryQuery(client, userId); }
    }),
    deleteArtwork: () => run('delete', COPY.deletingToast, async () => {
      try {
        await mobileArtworkLibraryService.deleteArtwork(artworkId, userId);
        await cancelReads();
        if (!current()) return false;
        removeArtworkFromLibraryQuery(client, userId, artworkId);
        // Preserve a tombstone until the screen leaves; do not refetch a deleted detail.
        if (query.data) client.setQueryData(key, { ...query.data, isDeleted: true });
        showToast({ label: COPY.removed, icon: 'trash' });
        return true;
      } catch (cause) {
        if (!current()) return false;
        const error = presentRequestError(cause, { ...ERROR_OPTIONS, fallbackMessage: COPY.deleteError });
        setActionError({ ...error, action: 'delete' });
        showToast({ label: error.message, tone: 'danger', icon: 'exclamationmark', durationMs: 4000 });
        return false;
      }
    }),
    updateArtwork: (updates: ArtworkMetadataUpdates) => run('edit', COPY.saving, async () => {
      try {
        const saved = await mobileArtworkLibraryService.updateArtwork(artworkId, updates);
        await cancelReads();
        if (!current()) return undefined;
        cacheArtwork(client, userId, saved);
        showToast({ label: COPY.updated, icon: 'pencil' });
        return saved;
      } catch (cause) {
        if (current()) showToast({ label: COPY.saveError, tone: 'danger', icon: 'exclamationmark' });
        throw cause;
      }
    }),
  };
}
