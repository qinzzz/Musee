import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MOBILE_API_BASE_URL, mobileArtworkAnalysisService, mobileArtworkBatchService, mobileArtworkUploadService } from '../api/runtime';
import type { RequestErrorPresentation } from '../api/requestErrorPresentation';
import { useCaptureDraft } from './CaptureDraftProvider';
import { presentArtworkAnalysisError, presentArtworkUploadError } from './captureErrorPresentation';
import type { AnalyzedArtwork, NativeImageAsset, PendingArtworkUpload } from './types';
import type { MobileArtworkBatchEntry } from './mobileArtworkBatchService';
import { pickArtworkImages } from '../platform/images/pickArtworkImage';
import { invalidateArtworkLibraryQuery } from '../library/artworkLibraryQuery';
import { showPendingToast, showToast, hideToast } from '../ui/toast';
import { ARTWORK_UPLOAD_COPY as COPY } from './artworkUploadCopy';

export type CaptureState =
  | { status: 'idle' }
  | { status: 'picking' }
  | { status: 'preview'; asset: NativeImageAsset; labelAsset?: NativeImageAsset }
  | { status: 'uploading'; asset: NativeImageAsset; labelAsset?: NativeImageAsset }
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
    labelAsset?: NativeImageAsset;
    error: RequestErrorPresentation;
  };

const ERROR_PRESENTATION_OPTIONS = { apiBaseUrl: MOBILE_API_BASE_URL, showTechnicalDetails: __DEV__ };

export function useArtworkUpload(userId: string) {
  const client = useQueryClient();
  const { clearDraft, draft } = useCaptureDraft();
  const [capture, setState] = useState<CaptureState>({ status: 'idle' });
  const owner = useRef(userId);
  owner.current = userId;
  const mounted = useRef(true);
  const running = useRef(false);
  const abort = useRef(new AbortController());
  useEffect(() => {
    mounted.current = true;
    abort.current = new AbortController();
    return () => { mounted.current = false; abort.current.abort(); if (running.current) hideToast(); };
  }, [userId]);
  const setCapture = useCallback((next: SetStateAction<CaptureState>) => {
    if (mounted.current && owner.current === userId) setState(next);
  }, [userId]);
  const notify: typeof showToast = (options) => { if (mounted.current && owner.current === userId) showToast(options); };
  const notifyPending: typeof showPendingToast = (options) => { if (mounted.current && owner.current === userId) showPendingToast(options); };
  useEffect(() => {
    if (!draft || draft.destination !== 'library') return;
    setCapture({ status: 'preview', asset: draft.asset, labelAsset: draft.labelAsset });
    clearDraft();
  }, [clearDraft, draft, setCapture]);
  async function run(work: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    try { await work(); }
    finally { running.current = false; }
  }
  const choosePhoto = async () => {
    if (running.current) return;
    running.current = true;
    setCapture({ status: 'picking' });
    try {
      const selection = await pickArtworkImages();
      if (!mounted.current || owner.current !== userId) return;
      if (!selection) {
        setCapture({ status: 'idle' });
        return;
      }
      if (selection.rejectedCount > 0) {
        notify({ label: COPY.rejectedPhotos, icon: 'exclamationmark', tone: 'neutral' });
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
      if (!mounted.current || owner.current !== userId) return;
      setCapture({
        status: 'upload-error',
        error: presentArtworkUploadError(error, ERROR_PRESENTATION_OPTIONS),
      });
    } finally { running.current = false; }
  };

  const batchErrorMessage = (entry: MobileArtworkBatchEntry): string => (
    entry.status === 'upload_failed'
      ? presentArtworkUploadError(entry.error, ERROR_PRESENTATION_OPTIONS).message
      : presentArtworkAnalysisError(entry.error, ERROR_PRESENTATION_OPTIONS).message
  );

  const runBatch = async (entries: MobileArtworkBatchEntry[]) => {
    if (!userId || entries.length === 0) return;
    setCapture({ status: 'batch', entries, running: true });
    notifyPending({ label: `Uploading artwork 1 of ${entries.length}…` });
    const completed = await mobileArtworkBatchService.process(
      entries,
      userId,
      (entry, index, nextEntries) => {
        setCapture({ status: 'batch', entries: nextEntries, running: true });
        if (entry.status === 'uploading') {
          notifyPending({ label: `Uploading artwork ${index + 1} of ${entries.length}…` });
        } else if (entry.status === 'uploaded') {
          invalidateArtworkLibraryQuery(client, userId);
        } else if (entry.status === 'analyzing') {
          notifyPending({ label: `Analyzing artwork ${index + 1} of ${entries.length}…` });
        }
      },
      abort.current.signal,
    );
    setCapture({ status: 'batch', entries: completed, running: false });
    invalidateArtworkLibraryQuery(client, userId);
    const savedCount = completed.filter((entry) => Boolean(entry.persisted)).length;
    const analysisFailureCount = completed.filter(
      (entry) => entry.status === 'analysis_failed',
    ).length;
    if (savedCount === entries.length && analysisFailureCount === 0) {
      notify({
        label: `Added ${savedCount} artworks to your Library`,
        icon: 'photo.stack',
      });
    } else if (savedCount > 0) {
      notify({
        label: savedCount === entries.length
          ? `Added ${savedCount} artworks; ${analysisFailureCount} need analysis`
          : `Added ${savedCount} of ${entries.length} artworks`,
        icon: 'exclamationmark',
        tone: 'neutral',
        durationMs: 4000,
      });
    } else {
      notify({
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
    if (!userId) return;
    const entryIndex = entries.findIndex((entry) => entry.id === entryId);
    const entry = entries[entryIndex];
    if (!entry) return;
    setCapture({ status: 'batch', entries, running: true });
    notifyPending({
      label: entry.persisted ? 'Analyzing artwork again…' : 'Uploading artwork again…',
    });
    const retried = await mobileArtworkBatchService.retry(
      entry,
      userId,
      (nextEntry) => {
        setCapture((current) => current.status === 'batch' ? {
          ...current,
          entries: current.entries.map((item) => item.id === entryId ? nextEntry : item),
          running: true,
        } : current);
        if (nextEntry.status === 'uploaded') {
          invalidateArtworkLibraryQuery(client, userId);
        }
      },
      abort.current.signal,
    );
    const nextEntries = entries.map((item) => item.id === entryId ? retried : item);
    setCapture({ status: 'batch', entries: nextEntries, running: false });
    invalidateArtworkLibraryQuery(client, userId);
    if (retried.status === 'complete') {
      notify({ label: 'Artwork added to your Library', icon: 'checkmark' });
    } else {
      notify({
        label: batchErrorMessage(retried),
        icon: 'exclamationmark',
        tone: 'danger',
        durationMs: 4000,
      });
    }
  };

  const analyzeArtwork = async (artwork: PendingArtworkUpload) => {
    setCapture({ status: 'analyzing', artwork, receivedChunk: false });
    notifyPending({ label: COPY.analyzingToast });
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
      notify({ label: COPY.analyzedToast, icon: 'sparkles' });
    } catch (error) {
      const presentation = presentArtworkAnalysisError(error, ERROR_PRESENTATION_OPTIONS);
      setCapture({
        status: 'analysis-error',
        artwork,
        error: presentation,
      });
      notify({
        label: presentation.message,
        icon: 'exclamationmark',
        tone: 'danger',
        durationMs: 4000,
      });
    } finally {
      invalidateArtworkLibraryQuery(client, userId);
    }
  };

  const uploadPhoto = async (asset: NativeImageAsset, labelAsset?: NativeImageAsset) => {
    if (!userId) return;
    setCapture({ status: 'uploading', asset, labelAsset });
    notifyPending({ label: COPY.uploadingToast });
    try {
      const artwork = await mobileArtworkUploadService.uploadArtwork(asset, userId);
      invalidateArtworkLibraryQuery(client, userId);
      if (mounted.current && owner.current === userId) await analyzeArtwork({ ...artwork, labelAsset });
    } catch (error) {
      const presentation = presentArtworkUploadError(error, ERROR_PRESENTATION_OPTIONS);
      setCapture({
        status: 'upload-error',
        asset,
        labelAsset,
        error: presentation,
      });
      notify({
        label: presentation.message,
        icon: 'exclamationmark',
        tone: 'danger',
        durationMs: 4000,
      });
    }
  };

  return {
    capture, setCapture, choosePhoto,
    uploadPhoto: (asset: NativeImageAsset, label?: NativeImageAsset) => run(() => uploadPhoto(asset, label)),
    analyzeArtwork: (artwork: PendingArtworkUpload) => run(() => analyzeArtwork(artwork)),
    runBatch: (entries: MobileArtworkBatchEntry[]) => run(() => runBatch(entries)),
    retryBatchEntry: (entries: MobileArtworkBatchEntry[], id: string) => run(() => retryBatchEntry(entries, id)),
    batchErrorMessage,
  };
}
