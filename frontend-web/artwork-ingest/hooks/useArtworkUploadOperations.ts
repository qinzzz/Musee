import { startTransition, useCallback, useMemo, useRef } from 'react';
import type { ChangeEvent, Dispatch, SetStateAction } from 'react';
import {
  analyzeArtworkFromExisting,
  saveArtworkUpload,
  type ArtworkAnalysisResult,
} from '../../api/analysis';
import { getArtworkFunFacts } from '../../api/artworks';
import { buildSessionLink } from '../../session/lib/sessionLinks';
import { MAX_SESSION_ARTWORK_BATCH_SIZE } from '../../session/constants';
import type { PendingSessionArtwork } from '../../session/types';
import type { GalleryItem, TagCoordinate } from '../../types';
import type { ArtworkStatePatch } from '../../artwork/lib/artworkState';
import { mergeArtworkState } from '../../artwork/lib/artworkState';
import { parseQuotaError } from '../../api/account';
import {
  buildBatchUploadFailureMessage,
  buildOversizedUploadMessage,
  buildUnpreparedUploadMessage,
  buildUnsupportedUploadMessage,
  getArtworkAnalysisErrorMessage,
  getArtworkUploadFailureCode,
  getArtworkUploadErrorMessage,
  isOversizedUploadImage,
  isSupportedUploadImage,
} from '../../lib/uploadValidation';
import { createLocationResolver } from '../lib/location';
import {
  buildUploadRequestKey,
  formatPhotoTime,
  normalizeUploadFile,
  readExifMetadata,
} from '../lib/metadata';
import {
  buildUploadLocationString,
  createPersistedUploadItem,
} from '../lib/placeholders';
import {
  buildStagedPendingUploads,
  buildUploadPlaceholders,
  prepareUploadCandidates,
} from '../lib/uploadWorkflow';
import type {
  CaptureSubmission,
  IngestMode,
  PreparedUploadCandidate,
  PreparedUploadIngestResult,
  PreparedSessionUploadEntry,
  PreparedUploadSessionContext,
} from '../types';
import type { ArtworkDetailSelection } from '../../artwork/types';

type ToastType = 'info' | 'success';

type UseArtworkIngestOptions = {
  userId: string;
  activeTab: 'newSession' | 'collect' | 'profile' | 'learn';
  // True when picked images should stage into the pending-batch tray instead
  // of ingesting immediately (new-session composer OR an open ongoing session).
  canStageSessionArtworks: boolean;
  pendingSessionArtworks: PendingSessionArtwork[];
  setPendingSessionArtworks: Dispatch<SetStateAction<PendingSessionArtwork[]>>;
  patchArtwork: (targetId: string, patch: ArtworkStatePatch) => void;
  addLocalArtworks: (items: GalleryItem[]) => void;
  replaceArtwork: (targetId: string, next: GalleryItem) => void;
  removeArtwork: (targetId: string) => void;
  artworkDetailSelection: ArtworkDetailSelection | null;
  setArtworkDetailSelection: Dispatch<SetStateAction<ArtworkDetailSelection | null>>;
  setTagPositions: Dispatch<SetStateAction<Record<string, TagCoordinate>>>;
  setIsAnalyzing: Dispatch<SetStateAction<boolean>>;
  showToast: (message: string, type?: ToastType) => void;
  parseAnalysis: (text: string | null) => string;
};

type AnalyzePersistedUploadOptions = {
  persistedItem: GalleryItem;
  liveItem: GalleryItem;
  sessionId?: string;
  sequenceNumber?: number;
  mode: IngestMode;
  labelFile?: File | null;
  previewUrl?: string;
};

type UploadProcessOptions = {
  labelFile?: File | null;
};

type BatchPersistedUpload = {
  item: GalleryItem;
  candidate: PreparedUploadCandidate;
};

function buildAnalyzedItem(
  baseItem: GalleryItem,
  analysis: ArtworkAnalysisResult,
  parseAnalysis: (text: string | null) => string,
  patch?: ArtworkStatePatch,
): GalleryItem {
  const keywords = analysis.tags.map((tag) => (tag.startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`));
  return mergeArtworkState(baseItem, {
    record: {
      keywords,
      artistName: analysis.artist_name,
      artworkName: analysis.artwork_name,
      description: parseAnalysis(analysis.description),
      date: analysis.date,
      medium: analysis.medium,
      artworkId: analysis.artwork_id || baseItem.artworkId,
      location:
        analysis.location && typeof analysis.location === 'object'
          ? JSON.stringify(analysis.location)
          : analysis.location || baseItem.location,
      photoTime: analysis.photo_time || baseItem.photoTime,
      referenceUrls: analysis.reference_urls || [],
      artistEntityId: analysis.artist_entity_id || undefined,
      ...(patch?.record || {}),
    },
    clientState: {
      isAnalyzing: false,
      analysisStatus: 'analyzed',
      analysisError: undefined,
      streamingText: undefined,
      syncStatus: 'synced',
      ...(patch?.clientState || {}),
    },
  });
}

export function useArtworkUploadOperations({
  userId,
  activeTab,
  canStageSessionArtworks,
  pendingSessionArtworks,
  setPendingSessionArtworks,
  patchArtwork,
  addLocalArtworks,
  replaceArtwork,
  removeArtwork,
  artworkDetailSelection,
  setArtworkDetailSelection,
  setTagPositions,
  setIsAnalyzing,
  showToast,
  parseAnalysis,
}: UseArtworkIngestOptions) {
  const inFlightUploadKeysRef = useRef<Set<string>>(new Set());
  const resolveMuseum = useMemo(() => createLocationResolver(), []);

  const updateSavedArtworkInState = patchArtwork;

  const markArtworkAnalysisFailed = useCallback((
    itemId: string,
    message: string,
  ) => {
    updateSavedArtworkInState(itemId, {
      clientState: {
        isAnalyzing: false,
        analysisStatus: 'failed',
        analysisError: message,
        streamingText: message,
        syncStatus: 'synced',
      },
    });
  }, [updateSavedArtworkInState]);

  const applyArtworkAnalysisResult = useCallback((
    itemId: string,
    analysis: ArtworkAnalysisResult,
    extras?: Partial<GalleryItem>,
  ): ArtworkStatePatch => {
    const keywords = analysis.tags.map((tag) => (tag.startsWith('#') ? tag.toLowerCase() : `#${tag.toLowerCase()}`));
    setTagPositions((prev) => {
      const updated = { ...prev };
      keywords.forEach((tag) => {
        if (!updated[tag]) {
          updated[tag] = {
            x: (Math.random() * 2 - 1),
            y: (Math.random() * 2 - 1),
          };
        }
      });
      return updated;
    });

    const updates: ArtworkStatePatch = {
      record: {
        keywords,
        artistName: analysis.artist_name,
        artworkName: analysis.artwork_name,
        description: parseAnalysis(analysis.description),
        date: analysis.date,
        medium: analysis.medium,
        artworkId: analysis.artwork_id,
        location:
          analysis.location && typeof analysis.location === 'object'
            ? JSON.stringify(analysis.location)
            : analysis.location,
        photoTime: analysis.photo_time,
        referenceUrls: analysis.reference_urls || [],
        artistEntityId: analysis.artist_entity_id || undefined,
        ...extras,
      },
      clientState: {
        isAnalyzing: false,
        analysisStatus: 'analyzed',
        analysisError: undefined,
        streamingText: undefined,
        syncStatus: 'synced',
      },
    };

    updateSavedArtworkInState(itemId, updates);
    return updates;
  }, [parseAnalysis, setTagPositions, updateSavedArtworkInState]);

  const removeUploadPlaceholder = useCallback((placeholderId: string) => {
    removeArtwork(placeholderId);
    setArtworkDetailSelection((prev) => (prev?.artworkClientId === placeholderId ? null : prev));
  }, [removeArtwork, setArtworkDetailSelection]);

  const persistRawArtwork = useCallback(async (options: {
    file: File;
    previewUrl: string;
    mode: IngestMode;
    timestamp: number;
    photoTime: string;
    coords?: { latitude?: number; longitude?: number };
    location?: string;
    sessionId?: string;
    sequenceNumber?: number;
  }): Promise<GalleryItem> => {
    const saved = await saveArtworkUpload(
      options.file,
      userId,
      options.sessionId,
      options.location,
      options.photoTime,
      options.coords?.latitude,
      options.coords?.longitude,
      options.mode === 'camera' ? 'camera' : 'upload',
      options.sequenceNumber,
    );

    return createPersistedUploadItem(saved, options);
  }, [userId]);

  const reconcilePlaceholderWithSavedArtwork = useCallback((
    placeholder: GalleryItem,
    persistedItem: GalleryItem,
  ): GalleryItem => {
    const reconciled: GalleryItem = {
      ...placeholder,
      artworkId: persistedItem.artworkId,
      sessionLinks: persistedItem.sessionLinks,
      location: persistedItem.location,
      photoTime: persistedItem.photoTime,
      artistName: persistedItem.artistName,
      artworkName: persistedItem.artworkName,
      analysisStatus: persistedItem.analysisStatus,
      analysisError: undefined,
      syncStatus: 'synced',
      isAnalyzing: true,
    };

    replaceArtwork(placeholder.id, reconciled);
    return reconciled;
  }, [replaceArtwork]);

  const maybeResolveLocation = useCallback((itemId: string, coords?: { latitude?: number; longitude?: number }) => {
    if (coords?.latitude === undefined || coords.longitude === undefined) {
      return;
    }
    resolveMuseum(coords.latitude, coords.longitude)
      .then(({ city, country, museum }) => {
        updateSavedArtworkInState(itemId, {
          record: {
            location: buildUploadLocationString(coords, { city, country, museum }),
          },
        });
      })
      .catch(() => {});
  }, [resolveMuseum, updateSavedArtworkInState]);

  const maybeHydrateFunFacts = useCallback((itemId: string) => {
    getArtworkFunFacts(itemId).then((funFacts) => {
      if (funFacts.length > 0) {
        updateSavedArtworkInState(itemId, {
          record: { insights: funFacts },
        });
      }
    }).catch(() => {});
  }, [updateSavedArtworkInState]);

  const analyzePersistedUpload = useCallback(async ({
    persistedItem,
    liveItem,
    sessionId,
    sequenceNumber,
    mode,
    labelFile,
    previewUrl,
  }: AnalyzePersistedUploadOptions): Promise<{ analysis: ArtworkAnalysisResult; resolvedItem: GalleryItem }> => {
    const analysis = await analyzeArtworkFromExisting(persistedItem.artworkId!, {
      labelFile: labelFile || null,
    });
    const analysisUpdates = applyArtworkAnalysisResult(persistedItem.id, analysis, {
      sessionLinks: buildSessionLink(
        sessionId,
        sequenceNumber,
        mode === 'camera' ? 'camera' : 'upload',
      ),
    });

    const resolvedItem = buildAnalyzedItem(liveItem, analysis, parseAnalysis, analysisUpdates);
    if (analysis.artist_name && analysis.artist_name !== 'Unknown Artist') {
      maybeHydrateFunFacts(persistedItem.id);
    }

    return { analysis, resolvedItem };
  }, [applyArtworkAnalysisResult, maybeHydrateFunFacts, parseAnalysis]);

  const ingestPreparedUploads = useCallback(async (
    uploadEntries: PreparedSessionUploadEntry[],
    context: PreparedUploadSessionContext,
  ): Promise<PreparedUploadIngestResult> => {
    const persistedSessionItems: GalleryItem[] = [];
    const persistedEntries: Array<{ entryId: string; item: GalleryItem }> = [];
    const failedEntries: PreparedUploadIngestResult['failedEntries'] = [];
    const analysisTasks: Array<Promise<GalleryItem | null>> = [];

    const preparedEntries = uploadEntries.map((uploadEntry) => ({
      uploadEntry,
      placeholder: buildUploadPlaceholders([{
        file: uploadEntry.file,
        previewUrl: uploadEntry.previewUrl,
        mode: uploadEntry.mode,
        timestamp: uploadEntry.timestamp,
        photoTime: uploadEntry.photoTime,
        coords: uploadEntry.coords,
        location: uploadEntry.location,
      }], {
        sessionId: context.sessionId,
        startingSequenceNumber: context.getSequenceNumber(uploadEntry.id),
      })[0],
    }));

    context.onPlaceholdersReady?.(preparedEntries.map(({ uploadEntry, placeholder }) => ({
      entryId: uploadEntry.id,
      item: placeholder,
    })));
    if (preparedEntries.length > 0) {
      addLocalArtworks(preparedEntries.map(({ placeholder }) => placeholder));
    }

    for (const { uploadEntry, placeholder } of preparedEntries) {
      let persistedItemId: string | null = null;
      const placeholderId = placeholder.id;

      try {
        const sequenceNumber = context.getSequenceNumber(uploadEntry.id);
        const persistedItem = await persistRawArtwork({
          file: uploadEntry.file,
          previewUrl: uploadEntry.previewUrl,
          mode: uploadEntry.mode,
          timestamp: uploadEntry.timestamp,
          photoTime: uploadEntry.photoTime,
          coords: uploadEntry.coords,
          location: uploadEntry.location,
          sessionId: context.sessionId,
          sequenceNumber,
        });
        persistedItemId = persistedItem.id;
        const liveItem = reconcilePlaceholderWithSavedArtwork(placeholder, persistedItem);
        maybeResolveLocation(persistedItem.id, uploadEntry.coords);
        persistedSessionItems.push(liveItem);
        persistedEntries.push({ entryId: uploadEntry.id, item: liveItem });

        analysisTasks.push(
          analyzePersistedUpload({
            persistedItem,
            liveItem,
            sessionId: context.sessionId,
            sequenceNumber,
            mode: uploadEntry.mode,
            labelFile: uploadEntry.labelFile,
            })
            .then(({ resolvedItem }) => resolvedItem)
            .catch((error) => {
              const message = getArtworkAnalysisErrorMessage(error);
              console.error('Failed to analyze staged upload:', error);
              markArtworkAnalysisFailed(persistedItem.id, message);
              return null;
            }),
        );
      } catch (error) {
        const quotaError = parseQuotaError(error);
        const message = quotaError
          ? quotaError.message
          : getArtworkUploadErrorMessage(error, uploadEntry.file);
        console.error('Failed to save/analyze staged upload:', error);
        failedEntries.push({
          entryId: uploadEntry.id,
          message,
          errorCode: quotaError ? 'quota_exceeded' : getArtworkUploadFailureCode(error),
        });
        if (placeholderId && persistedItemId) {
          markArtworkAnalysisFailed(persistedItemId, message);
        } else if (placeholderId) {
          removeUploadPlaceholder(placeholderId);
        }
      }
    }

    const analysisResultsPromise = Promise.all(analysisTasks);
    const analysisPromise = analysisResultsPromise.then((results) => (
      results.filter((item): item is GalleryItem => Boolean(item))
    ));
    const analysisFailureCountPromise = analysisResultsPromise.then((results) => (
      results.filter((item) => item === null).length
    ));

    return {
      persistedItems: persistedSessionItems,
      persistedEntries,
      failedEntries,
      analysisPromise,
      analysisFailureCountPromise,
    };
  }, [
    analyzePersistedUpload,
    markArtworkAnalysisFailed,
    maybeResolveLocation,
    persistRawArtwork,
    reconcilePlaceholderWithSavedArtwork,
    removeUploadPlaceholder,
    addLocalArtworks,
    showToast,
  ]);

  const processSingleCollectionUpload = useCallback(async (
    preparedUpload: PreparedUploadCandidate,
    mode: IngestMode,
    collectionUploadSuccessMessage: string,
    options?: UploadProcessOptions,
  ) => {
    setIsAnalyzing(true);
    let placeholder: GalleryItem | null = null;
    let persistedItemId: string | null = null;

    try {
      placeholder = buildUploadPlaceholders([preparedUpload], {
        startingSequenceNumber: 0,
      })[0];
      addLocalArtworks([placeholder!]);

      const persistedItem = await persistRawArtwork({
        file: preparedUpload.file,
        previewUrl: preparedUpload.previewUrl,
        mode,
        timestamp: preparedUpload.timestamp,
        photoTime: preparedUpload.photoTime,
        coords: preparedUpload.coords,
        location: preparedUpload.location,
        sequenceNumber: 0,
      });
      persistedItemId = persistedItem.id;
      const liveItem = reconcilePlaceholderWithSavedArtwork(placeholder, persistedItem);
      showToast(collectionUploadSuccessMessage, 'success');

      maybeResolveLocation(persistedItem.id, preparedUpload.coords);

      await analyzePersistedUpload({
        persistedItem,
        liveItem,
        mode,
        labelFile: options?.labelFile || null,
        previewUrl: preparedUpload.previewUrl,
      });
    } catch (error) {
      console.error('Upload failed:', error);
      const quotaError = parseQuotaError(error);
      if (placeholder && persistedItemId) {
        const message = getArtworkAnalysisErrorMessage(error);
        markArtworkAnalysisFailed(persistedItemId, message);
        showToast(message, 'info');
      } else if (placeholder) {
        removeUploadPlaceholder(placeholder.id);
        showToast(
          quotaError?.message || getArtworkUploadErrorMessage(error, preparedUpload.file),
          'info',
        );
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [
    analyzePersistedUpload,
    markArtworkAnalysisFailed,
    maybeResolveLocation,
    persistRawArtwork,
    reconcilePlaceholderWithSavedArtwork,
    removeUploadPlaceholder,
    setIsAnalyzing,
    addLocalArtworks,
    showToast,
  ]);

  const processBatchCollectionUploads = useCallback(async (
    preparedUploads: PreparedUploadCandidate[],
    mode: IngestMode,
    collectionUploadSuccessMessage: string,
  ) => {
    setIsAnalyzing(true);
    try {
      const anchorCandidate = preparedUploads[0];
      const placeholders = buildUploadPlaceholders(preparedUploads, {
        startingSequenceNumber: 0,
      });

      if (placeholders.length > 0) {
        addLocalArtworks(placeholders);
      }

      const persistedUploads: BatchPersistedUpload[] = [];
      const uploadFailureMessages: string[] = [];

      for (let index = 0; index < preparedUploads.length; index += 1) {
        const entry = preparedUploads[index];
        const placeholder = placeholders[index];
        try {
          const persistedItem = await persistRawArtwork({
            file: entry.file,
            previewUrl: entry.previewUrl,
            mode,
            timestamp: entry.timestamp,
            photoTime: entry.photoTime,
            coords: entry.coords,
            location: entry.location,
            sequenceNumber: index,
          });
          const liveItem = reconcilePlaceholderWithSavedArtwork(placeholder, persistedItem);
          persistedUploads.push({
            item: liveItem,
            candidate: entry,
          });
        } catch (error) {
          console.error('Failed to save artwork before analysis:', error);
          const quotaError = parseQuotaError(error);
          uploadFailureMessages.push(
            quotaError?.message || getArtworkUploadErrorMessage(error, entry.file),
          );
          removeUploadPlaceholder(placeholder.id);
        }
      }

      const persistedItems = persistedUploads.map((entry) => entry.item);
      if (persistedItems.length > 0) {
        showToast(collectionUploadSuccessMessage, 'success');
      }
      const uploadFailureMessage = buildBatchUploadFailureMessage(
        uploadFailureMessages,
        persistedItems.length,
      );
      if (uploadFailureMessage) {
        showToast(uploadFailureMessage, 'info');
      }

      if (anchorCandidate?.coords?.latitude !== undefined && anchorCandidate.coords.longitude !== undefined) {
        resolveMuseum(anchorCandidate.coords.latitude, anchorCandidate.coords.longitude)
          .then(({ city, country, museum }) => {
            const resolvedLocation = buildUploadLocationString(
              { latitude: anchorCandidate.coords!.latitude, longitude: anchorCandidate.coords!.longitude },
              { city, country, museum },
            );
            persistedUploads.forEach((upload) => {
              patchArtwork(upload.item.id, { record: { location: resolvedLocation } });
            });
          })
          .catch(() => {});
      }

      let showedAnalysisFailure = false;
      for (const entry of persistedUploads) {
        try {
          await analyzePersistedUpload({
            persistedItem: entry.item,
            liveItem: entry.item,
            mode,
            previewUrl: entry.candidate.previewUrl,
          });
        } catch (error) {
          const message = getArtworkAnalysisErrorMessage(error);
          markArtworkAnalysisFailed(entry.item.id, message);
          if (!showedAnalysisFailure) {
            showedAnalysisFailure = true;
            showToast(message, 'info');
          }
        }
      }

    } finally {
      setIsAnalyzing(false);
    }
  }, [
    analyzePersistedUpload,
    markArtworkAnalysisFailed,
    persistRawArtwork,
    reconcilePlaceholderWithSavedArtwork,
    removeUploadPlaceholder,
    resolveMuseum,
    setIsAnalyzing,
    addLocalArtworks,
    patchArtwork,
    showToast,
  ]);

  const processArtworkFiles = useCallback(async (
    rawFiles: File[],
    mode: IngestMode = 'camera',
    resetInput?: () => void,
    options?: { labelFile?: File | null; captureCoords?: { latitude: number; longitude: number } | null },
  ) => {
    const invalidFiles = rawFiles.filter((file) => !isSupportedUploadImage(file));
    if (invalidFiles.length > 0) {
      showToast(buildUnsupportedUploadMessage(invalidFiles), 'info');
    }

    const acceptedFiles = rawFiles.filter((file) => isSupportedUploadImage(file));
    if (acceptedFiles.length === 0) {
      resetInput?.();
      return;
    }

    const normalizationResults = await Promise.all(acceptedFiles.map(async (file) => {
      try {
        return { originalFile: file, normalizedFile: await normalizeUploadFile(file) };
      } catch (error) {
        console.error('Failed to prepare image for upload:', error);
        return { originalFile: file, normalizedFile: null };
      }
    }));
    const unpreparedFiles = normalizationResults
      .filter((entry) => !entry.normalizedFile)
      .map((entry) => entry.originalFile);
    if (unpreparedFiles.length > 0) {
      showToast(buildUnpreparedUploadMessage(unpreparedFiles), 'info');
    }

    const normalizedFiles = normalizationResults
      .map((entry) => entry.normalizedFile)
      .filter((file): file is File => Boolean(file));
    const oversizedFiles = normalizedFiles.filter(isOversizedUploadImage);
    if (oversizedFiles.length > 0) {
      showToast(buildOversizedUploadMessage(oversizedFiles), 'info');
    }
    const files = normalizedFiles.filter((file) => !isOversizedUploadImage(file));
    if (files.length === 0) {
      resetInput?.();
      return;
    }

    const shouldStageUpload =
      activeTab === 'newSession' &&
      canStageSessionArtworks;

    if (shouldStageUpload) {
      const remainingSlots = Math.max(0, MAX_SESSION_ARTWORK_BATCH_SIZE - pendingSessionArtworks.length);
      if (remainingSlots === 0) {
        showToast(`You can add up to ${MAX_SESSION_ARTWORK_BATCH_SIZE} artworks at a time.`, 'info');
        resetInput?.();
        return;
      }

      const filesToStage = files.slice(0, remainingSlots);
      if (filesToStage.length < files.length) {
        showToast(`Only the first ${MAX_SESSION_ARTWORK_BATCH_SIZE} artworks were added to the batch.`, 'info');
      }

      const stagedEntries = buildStagedPendingUploads(await prepareUploadCandidates(filesToStage, mode, {
        captureCoords: options?.captureCoords,
        readExifMetadata,
        formatPhotoTime,
        buildUploadLocationString,
      }));

      startTransition(() => {
        setPendingSessionArtworks((prev) => [...prev, ...stagedEntries]);
      });
      resetInput?.();
      return;
    }

    if (activeTab !== 'collect') {
      resetInput?.();
      return;
    }
    const collectionUploadSuccessMessage =
      files.length === 1 ? 'Added an artwork to collection' : `Added ${files.length} artworks to collection`;
    const uploadKey = buildUploadRequestKey(files, mode, options);

    if (inFlightUploadKeysRef.current.has(uploadKey)) {
      console.warn('Ignoring duplicate upload request while analysis is already in progress:', uploadKey);
      resetInput?.();
      return;
    }

    inFlightUploadKeysRef.current.add(uploadKey);

    try {
      const preparedUploads = await prepareUploadCandidates(files, mode, {
        captureCoords: options?.captureCoords,
        readExifMetadata,
        formatPhotoTime,
        buildUploadLocationString,
      });

      if (files.length === 1) {
        await processSingleCollectionUpload(
          preparedUploads[0],
          mode,
          collectionUploadSuccessMessage,
          { labelFile: options?.labelFile || null },
        );
      } else {
        await processBatchCollectionUploads(
          preparedUploads,
          mode,
          collectionUploadSuccessMessage,
        );
      }
    } finally {
      inFlightUploadKeysRef.current.delete(uploadKey);
      resetInput?.();
    }
  }, [
    activeTab,
    canStageSessionArtworks,
    pendingSessionArtworks,
    setPendingSessionArtworks,
    showToast,
    processBatchCollectionUploads,
    processSingleCollectionUpload,
  ]);

  const handleFileUpload = useCallback(async (
    event: ChangeEvent<HTMLInputElement>,
    mode: IngestMode = 'camera',
  ) => {
    const target = event.target as HTMLInputElement;
    const rawFiles = Array.from(target.files || []);
    await processArtworkFiles(rawFiles, mode, () => {
      if (target) {
        target.value = '';
      }
    });
  }, [processArtworkFiles]);

  const prepareCaptureSubmission = useCallback(async (payload: CaptureSubmission): Promise<PreparedSessionUploadEntry | null> => {
    const [artworkResult, labelResult] = await Promise.allSettled([
      normalizeUploadFile(payload.artwork),
      payload.label ? normalizeUploadFile(payload.label) : Promise.resolve(null),
    ]);
    if (artworkResult.status === 'rejected' || labelResult.status === 'rejected') {
      const failedFiles = [
        artworkResult.status === 'rejected' ? payload.artwork : null,
        labelResult.status === 'rejected' ? payload.label : null,
      ].filter((file): file is File => Boolean(file));
      console.error('Failed to prepare captured image:', {
        artworkError: artworkResult.status === 'rejected' ? artworkResult.reason : null,
        labelError: labelResult.status === 'rejected' ? labelResult.reason : null,
      });
      showToast(buildUnpreparedUploadMessage(failedFiles), 'info');
      return null;
    }
    const normalizedArtwork = artworkResult.value;
    const normalizedLabel = labelResult.value;
    const oversizedFiles = [normalizedArtwork, normalizedLabel]
      .filter((file): file is File => Boolean(file))
      .filter(isOversizedUploadImage);
    if (oversizedFiles.length > 0) {
      showToast(buildOversizedUploadMessage(oversizedFiles), 'info');
      return null;
    }
    const [candidate] = await prepareUploadCandidates([normalizedArtwork], 'camera', {
      captureCoords: payload.coords || null,
      readExifMetadata,
      formatPhotoTime,
      buildUploadLocationString,
    });
    const [entry] = buildStagedPendingUploads([candidate]);
    return { ...entry, labelFile: normalizedLabel };
  }, [showToast]);

  return {
    updateSavedArtworkInState,
    applyArtworkAnalysisResult,
    markArtworkAnalysisFailed,
    handleFileUpload,
    processArtworkFiles,
    prepareCaptureSubmission,
    ingestPreparedUploads,
  };
}
