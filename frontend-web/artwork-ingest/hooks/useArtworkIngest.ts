import { startTransition, useCallback, useMemo, useRef } from 'react';
import type { ChangeEvent, Dispatch, SetStateAction } from 'react';
import {
  analyzeArtworkFromExisting,
  saveArtworkUpload,
  type ArtworkAnalysisResult,
} from '../../api/analysis';
import { fetchAndPersistInsights } from '../../api/artworks';
import { hasUsableCommentaryContext } from '../../session/lib/commentary';
import { buildSessionLink, itemBelongsToSession } from '../../session/lib/sessionLinks';
import type { PendingSessionArtwork, SessionDraft, SessionStreamMessage } from '../../session/types';
import type { ArtworkWorkspace, GalleryItem, TagCoordinate } from '../../types';
import type { ArtworkStatePatch } from '../../artwork/lib/artworkState';
import { mergeArtworkState, updateArtworkInList } from '../../artwork/lib/artworkState';
import { buildUnsupportedUploadMessage, isSupportedUploadImage } from '../../lib/uploadValidation';
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
  buildArtworkInputEvent,
  buildPersistedSessionArtworkEntries,
  buildPreparedUploadDisplayEvents,
  buildStagedPendingUploads,
  buildUploadPlaceholders,
  getNextSessionArtworkSequenceNumber,
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
  defaultSessionTitle: string;
  activeTab: 'newSession' | 'collect' | 'profile' | 'learn';
  isComposingNewSession: boolean;
  pendingSessionArtworks: PendingSessionArtwork[];
  items: GalleryItem[];
  sessionStreams: Record<string, SessionStreamMessage[]>;
  setPendingSessionArtworks: Dispatch<SetStateAction<PendingSessionArtwork[]>>;
  setItems: Dispatch<SetStateAction<GalleryItem[]>>;
  setVisit: Dispatch<SetStateAction<ArtworkWorkspace>>;
  artworkDetailSelection: ArtworkDetailSelection | null;
  setArtworkDetailSelection: Dispatch<SetStateAction<ArtworkDetailSelection | null>>;
  setTagPositions: Dispatch<SetStateAction<Record<string, TagCoordinate>>>;
  setSessionDrafts: Dispatch<SetStateAction<SessionDraft[]>>;
  setIsAnalyzing: Dispatch<SetStateAction<boolean>>;
  setFilteredSessionId: Dispatch<SetStateAction<string | null>>;
  showToast: (message: string, type?: ToastType) => void;
  parseAnalysis: (text: string | null) => string;
  resolveUploadSession: () => { sessionId?: string; isNew: boolean };
  appendSessionEvents: (sessionId: string, newMessages: SessionStreamMessage[], options?: { persist?: boolean }) => void;
  persistSessionArtworkInput: (
    sessionId: string,
    artworks: Array<{ artworkId: string; source: 'upload' | 'capture' | 'library' }>,
    userInputEventId: string,
    content?: string,
  ) => void | Promise<void>;
  triggerUploadCommentary: (
    sessionId: string,
    artworks: GalleryItem[],
    sessionItemsOverride?: GalleryItem[],
    history?: SessionStreamMessage[],
    parentEventId?: string,
  ) => void;
  onExitSessionCapture: () => void;
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

export function useArtworkIngest({
  userId,
  defaultSessionTitle,
  activeTab,
  isComposingNewSession,
  pendingSessionArtworks,
  items,
  sessionStreams,
  setPendingSessionArtworks,
  setItems,
  setVisit,
  artworkDetailSelection,
  setArtworkDetailSelection,
  setTagPositions,
  setSessionDrafts,
  setIsAnalyzing,
  setFilteredSessionId,
  showToast,
  parseAnalysis,
  resolveUploadSession,
  appendSessionEvents,
  persistSessionArtworkInput,
  triggerUploadCommentary,
  onExitSessionCapture,
}: UseArtworkIngestOptions) {
  const inFlightUploadKeysRef = useRef<Set<string>>(new Set());
  const resolveMuseum = useMemo(() => createLocationResolver(), []);

  const updateSavedArtworkInState = useCallback((
    targetId: string,
    patch: ArtworkStatePatch,
  ) => {
    setItems((prev) => updateArtworkInList(prev, targetId, patch));
  }, [setItems]);

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
    setItems((prev) => prev.filter((item) => item.id !== placeholderId));
    setVisit((prev) => ({
      ...prev,
      itemIds: prev.itemIds.filter((id) => id !== placeholderId),
    }));
    setArtworkDetailSelection((prev) => (prev?.artworkClientId === placeholderId ? null : prev));
  }, [setArtworkDetailSelection, setItems, setVisit]);

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

    setItems((prev) => prev.map((item) => (item.id === placeholder.id ? reconciled : item)));
    return reconciled;
  }, [setItems]);

  const ensureSessionDraft = useCallback((sessionId: string) => {
    const now = Date.now();
    const newSession: SessionDraft = {
      id: sessionId,
      title: defaultSessionTitle,
      createdAt: now,
      updatedAt: now,
    };
    setSessionDrafts((prev) => [newSession, ...prev.filter((session) => session.id !== sessionId)]);
  }, [defaultSessionTitle, setSessionDrafts]);

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

  const maybeHydrateInsights = useCallback((itemId: string) => {
    fetchAndPersistInsights(itemId).then((insights) => {
      if (insights.length > 0) {
        updateSavedArtworkInState(itemId, {
          record: { insights },
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
      maybeHydrateInsights(persistedItem.id);
    }

    return { analysis, resolvedItem };
  }, [applyArtworkAnalysisResult, defaultSessionTitle, maybeHydrateInsights, parseAnalysis]);

  const ingestPreparedUploads = useCallback(async (
    uploadEntries: PreparedSessionUploadEntry[],
    context: PreparedUploadSessionContext,
  ): Promise<PreparedUploadIngestResult> => {
    const persistedSessionItems: GalleryItem[] = [];
    const analysisTasks: Array<Promise<GalleryItem | null>> = [];

    for (const uploadEntry of uploadEntries) {
      let persistedItemId: string | null = null;
      let placeholderId: string | null = null;

      try {
        const sequenceNumber = context.getSequenceNumber(uploadEntry.id);
        const placeholder = buildUploadPlaceholders([{
          file: uploadEntry.file,
          previewUrl: uploadEntry.previewUrl,
          mode: uploadEntry.mode,
          timestamp: uploadEntry.timestamp,
          photoTime: uploadEntry.photoTime,
          coords: uploadEntry.coords,
          location: uploadEntry.location,
        }], {
          sessionId: context.sessionId,
          startingSequenceNumber: sequenceNumber,
        })[0];
        placeholderId = placeholder.id;
        setItems((prev) => [placeholder, ...prev]);
        setVisit((prev) => ({ ...prev, itemIds: [...prev.itemIds, placeholder.id] }));

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
        // Local-only optimistic rendering; the prepared-session flow persists
        // the whole batch as one canonical user_input event after all resolve.
        appendSessionEvents(
          context.sessionId,
          buildPreparedUploadDisplayEvents(placeholder.id, persistedItem.artworkId!, context.userInputEventId),
          { persist: false },
        );
        maybeResolveLocation(persistedItem.id, uploadEntry.coords);
        persistedSessionItems.push(liveItem);

        analysisTasks.push(
          analyzePersistedUpload({
            persistedItem,
            liveItem,
            sessionId: context.sessionId,
            sequenceNumber,
            mode: uploadEntry.mode,
          })
            .then(({ resolvedItem }) => resolvedItem)
            .catch((error) => {
              const message = error instanceof Error ? error.message : 'Analysis failed.';
              console.error('Failed to analyze staged upload:', error);
              markArtworkAnalysisFailed(persistedItem.id, message);
              return null;
            }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Analysis failed.';
        console.error('Failed to save/analyze staged upload:', error);
        if (placeholderId && persistedItemId) {
          markArtworkAnalysisFailed(persistedItemId, message);
        } else if (placeholderId) {
          removeUploadPlaceholder(placeholderId);
        }
      }
    }

    const analysisPromise = Promise.all(analysisTasks).then((results) => (
      results.filter((item): item is GalleryItem => Boolean(item))
    ));

    return {
      persistedItems: persistedSessionItems,
      analysisPromise,
    };
  }, [
    analyzePersistedUpload,
    appendSessionEvents,
    markArtworkAnalysisFailed,
    maybeResolveLocation,
    persistRawArtwork,
    reconcilePlaceholderWithSavedArtwork,
    removeUploadPlaceholder,
    setItems,
    setVisit,
  ]);

  const processSinglePreparedUpload = useCallback(async (
    preparedUpload: PreparedUploadCandidate,
    mode: IngestMode,
    isLibraryOnlyUpload: boolean,
    collectionUploadSuccessMessage: string,
    options?: UploadProcessOptions,
  ) => {
    setIsAnalyzing(true);
    let placeholder: GalleryItem | null = null;
    let persistedItemId: string | null = null;
    let userInputEventId: string | undefined;

    try {
      const { sessionId, isNew } = isLibraryOnlyUpload
        ? { sessionId: undefined, isNew: false }
        : resolveUploadSession();

      if (isNew && sessionId) {
        ensureSessionDraft(sessionId);
      }
      const sessionArtworkSequenceNumber = sessionId
        ? getNextSessionArtworkSequenceNumber(items, sessionId)
        : 0;

      placeholder = buildUploadPlaceholders([preparedUpload], {
        sessionId,
        startingSequenceNumber: sessionArtworkSequenceNumber,
      })[0];

      if (sessionId) {
        const optimisticEvent = buildArtworkInputEvent([placeholder.id], {
          mode,
          history: sessionStreams[sessionId] || [],
        });
        userInputEventId = optimisticEvent.id;
        appendSessionEvents(sessionId, [optimisticEvent], { persist: false });
      }

      setItems((prev) => [placeholder!, ...prev]);
      if (sessionId) {
        setVisit((prev) => ({ ...prev, itemIds: [...prev.itemIds, placeholder!.id] }));
      }

      const persistedItem = await persistRawArtwork({
        file: preparedUpload.file,
        previewUrl: preparedUpload.previewUrl,
        mode,
        timestamp: preparedUpload.timestamp,
        photoTime: preparedUpload.photoTime,
        coords: preparedUpload.coords,
        location: preparedUpload.location,
        sessionId,
        sequenceNumber: sessionArtworkSequenceNumber,
      });
      persistedItemId = persistedItem.id;
      const liveItem = reconcilePlaceholderWithSavedArtwork(placeholder, persistedItem);

      if (sessionId) {
        const localInputEvent = buildArtworkInputEvent([persistedItem.artworkId!], {
          mode,
          history: sessionStreams[sessionId] || [],
          eventId: userInputEventId!,
        });
        appendSessionEvents(sessionId, [localInputEvent], { persist: false });
        void persistSessionArtworkInput(
          sessionId,
          [{ artworkId: persistedItem.artworkId!, source: mode === 'camera' ? 'capture' : 'upload' }],
          userInputEventId!,
        );
      }

      if (isLibraryOnlyUpload) {
        showToast(collectionUploadSuccessMessage, 'success');
      }

      maybeResolveLocation(persistedItem.id, preparedUpload.coords);

      const { analysis, resolvedItem } = await analyzePersistedUpload({
        persistedItem,
        liveItem,
        sessionId,
        sequenceNumber: sessionArtworkSequenceNumber,
        mode,
        labelFile: options?.labelFile || null,
        previewUrl: preparedUpload.previewUrl,
      });

      if (sessionId && hasUsableCommentaryContext(analysis)) {
        const sessionItems = [
          resolvedItem,
          ...items.filter((entry) => entry.id !== placeholder.id && entry.id !== persistedItem.id),
        ]
          .filter((item) => itemBelongsToSession(item, sessionId));
        const history = userInputEventId
          ? [
              ...(sessionStreams[sessionId] || []),
              buildArtworkInputEvent([persistedItem.artworkId!], {
                mode,
                history: sessionStreams[sessionId] || [],
                eventId: userInputEventId,
              }),
            ]
          : sessionStreams[sessionId] || [];
        triggerUploadCommentary(sessionId, [resolvedItem], sessionItems, history, userInputEventId);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      if (placeholder && persistedItemId) {
        const message = error instanceof Error ? error.message : 'Analysis failed.';
        markArtworkAnalysisFailed(persistedItemId, message);
      } else if (placeholder) {
        removeUploadPlaceholder(placeholder.id);
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [
    analyzePersistedUpload,
    appendSessionEvents,
    ensureSessionDraft,
    items,
    markArtworkAnalysisFailed,
    maybeResolveLocation,
    persistRawArtwork,
    persistSessionArtworkInput,
    reconcilePlaceholderWithSavedArtwork,
    removeUploadPlaceholder,
    resolveUploadSession,
    setIsAnalyzing,
    setItems,
    setVisit,
    showToast,
    triggerUploadCommentary,
    sessionStreams,
  ]);

  const processBatchPreparedUploads = useCallback(async (
    preparedUploads: PreparedUploadCandidate[],
    mode: IngestMode,
    isLibraryOnlyUpload: boolean,
    collectionUploadSuccessMessage: string,
  ) => {
    setIsAnalyzing(true);
    try {
      const anchorCandidate = preparedUploads[0];
      const { sessionId: batchSessionId, isNew } = isLibraryOnlyUpload
        ? { sessionId: undefined, isNew: false }
        : resolveUploadSession();

      if (isNew && batchSessionId) {
        ensureSessionDraft(batchSessionId);
      }

      if (batchSessionId) {
        setVisit((prev) => ({ ...prev, id: batchSessionId, itemIds: [], globalConversation: [] }));
      }
      const batchSequenceStart = batchSessionId
        ? getNextSessionArtworkSequenceNumber(items, batchSessionId)
        : 0;

      const placeholders = buildUploadPlaceholders(preparedUploads, {
        sessionId: batchSessionId,
        startingSequenceNumber: batchSequenceStart,
      });

      let batchUserInputEventId: string | undefined;
      let batchLocalInputEvent: SessionStreamMessage | undefined;
      if (batchSessionId && placeholders.length > 0) {
        batchLocalInputEvent = buildArtworkInputEvent(
          placeholders.map((placeholder) => placeholder.id),
          {
            mode,
            history: sessionStreams[batchSessionId] || [],
          },
        );
        batchUserInputEventId = batchLocalInputEvent.id;
        appendSessionEvents(batchSessionId, [batchLocalInputEvent], { persist: false });
      }

      if (placeholders.length > 0) {
        setItems((prev) => [...placeholders, ...prev]);
        if (batchSessionId) {
          setVisit((prev) => ({
            ...prev,
            itemIds: [...prev.itemIds, ...placeholders.map((item) => item.id)],
          }));
        }
      }

      const persistedUploads: BatchPersistedUpload[] = [];

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
            sessionId: batchSessionId,
            sequenceNumber: batchSequenceStart + index,
          });
          const liveItem = reconcilePlaceholderWithSavedArtwork(placeholder, persistedItem);
          persistedUploads.push({
            item: liveItem,
            candidate: entry,
          });
        } catch (error) {
          console.error('Failed to save artwork before analysis:', error);
          removeUploadPlaceholder(placeholder.id);
        }
      }

      const persistedItems = persistedUploads.map((entry) => entry.item);
      if (persistedItems.length > 0) {
        if (batchSessionId) {
          const inputEntries = buildPersistedSessionArtworkEntries(persistedItems, batchSessionId);
          batchLocalInputEvent = buildArtworkInputEvent(
            inputEntries.map((entry) => entry.artworkId),
            {
              mode,
              history: sessionStreams[batchSessionId] || [],
              eventId: batchUserInputEventId!,
            },
          );
          appendSessionEvents(batchSessionId, [batchLocalInputEvent], { persist: false });
          void persistSessionArtworkInput(batchSessionId, inputEntries, batchUserInputEventId!);
        }
        if (isLibraryOnlyUpload) {
          showToast(collectionUploadSuccessMessage, 'success');
        }
      }

      if (anchorCandidate?.coords?.latitude !== undefined && anchorCandidate.coords.longitude !== undefined) {
        resolveMuseum(anchorCandidate.coords.latitude, anchorCandidate.coords.longitude)
          .then(({ city, country, museum }) => {
            const resolvedLocation = buildUploadLocationString(
              { latitude: anchorCandidate.coords!.latitude, longitude: anchorCandidate.coords!.longitude },
              { city, country, museum },
            );
            setItems((prev) => prev.map((item) => (
              persistedUploads.some((upload) => upload.item.id === item.id)
                ? { ...item, location: resolvedLocation }
                : item
            )));
          })
          .catch(() => {});
      }

      const analyzedArtworks: GalleryItem[] = [];
      for (const entry of persistedUploads) {
        try {
          const { analysis, resolvedItem } = await analyzePersistedUpload({
            persistedItem: entry.item,
            liveItem: entry.item,
            sessionId: batchSessionId,
            sequenceNumber: entry.item.sessionLinks?.[0]?.sequenceNumber,
            mode,
            previewUrl: entry.candidate.previewUrl,
          });
          if (hasUsableCommentaryContext(analysis)) {
            analyzedArtworks.push(resolvedItem);
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Analysis failed.';
          markArtworkAnalysisFailed(entry.item.id, errMsg || 'Analysis failed.');
        }
      }

      if (batchSessionId && analyzedArtworks.length > 0) {
        const history = batchLocalInputEvent
          ? [...(sessionStreams[batchSessionId] || []), batchLocalInputEvent]
          : sessionStreams[batchSessionId] || [];
        triggerUploadCommentary(batchSessionId, analyzedArtworks, analyzedArtworks, history, batchUserInputEventId);
      }
      if (batchSessionId && persistedItems.length >= 2) {
        setFilteredSessionId(batchSessionId);
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [
    analyzePersistedUpload,
    appendSessionEvents,
    ensureSessionDraft,
    items,
    markArtworkAnalysisFailed,
    persistRawArtwork,
    persistSessionArtworkInput,
    reconcilePlaceholderWithSavedArtwork,
    removeUploadPlaceholder,
    resolveMuseum,
    resolveUploadSession,
    setFilteredSessionId,
    setIsAnalyzing,
    setItems,
    setVisit,
    showToast,
    triggerUploadCommentary,
    sessionStreams,
  ]);

  const processArtworkFiles = useCallback(async (
    rawFiles: File[],
    mode: IngestMode = 'camera',
    resetInput?: () => void,
    options?: { labelFile?: File | null; bypassStaging?: boolean; captureCoords?: { latitude: number; longitude: number } | null },
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

    const files = await Promise.all(acceptedFiles.map((file) => normalizeUploadFile(file)));
    if (files.length === 0) {
      resetInput?.();
      return;
    }

    const shouldStageUpload =
      !options?.bypassStaging &&
      activeTab === 'newSession' &&
      isComposingNewSession &&
      (mode === 'gallery' || pendingSessionArtworks.length > 0);

    if (shouldStageUpload) {
      const remainingSlots = Math.max(0, 5 - pendingSessionArtworks.length);
      if (remainingSlots === 0) {
        showToast('You can add up to 5 artworks to start a session.', 'info');
        resetInput?.();
        return;
      }

      const filesToStage = files.slice(0, remainingSlots);
      if (filesToStage.length < files.length) {
        showToast('Only the first 5 artworks can be added to a new session.', 'info');
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

    const isLibraryOnlyUpload = activeTab === 'collect';
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
        await processSinglePreparedUpload(
          preparedUploads[0],
          mode,
          isLibraryOnlyUpload,
          collectionUploadSuccessMessage,
          { labelFile: options?.labelFile || null },
        );
      } else {
        await processBatchPreparedUploads(
          preparedUploads,
          mode,
          isLibraryOnlyUpload,
          collectionUploadSuccessMessage,
        );
      }
    } finally {
      inFlightUploadKeysRef.current.delete(uploadKey);
      resetInput?.();
    }
  }, [
    activeTab,
    isComposingNewSession,
    pendingSessionArtworks,
    setPendingSessionArtworks,
    showToast,
    processBatchPreparedUploads,
    processSinglePreparedUpload,
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

  const handleSessionCaptureSubmit = useCallback(async (payload: CaptureSubmission) => {
    const [normalizedArtwork, normalizedLabel] = await Promise.all([
      normalizeUploadFile(payload.artwork),
      payload.label ? normalizeUploadFile(payload.label) : Promise.resolve(null),
    ]);

    onExitSessionCapture();

    window.setTimeout(() => {
      void processArtworkFiles(
        [normalizedArtwork],
        'camera',
        undefined,
        {
          labelFile: normalizedLabel,
          bypassStaging: true,
          captureCoords: payload.coords || null,
        },
      );
    }, 0);
  }, [onExitSessionCapture, processArtworkFiles]);

  return {
    updateSavedArtworkInState,
    applyArtworkAnalysisResult,
    markArtworkAnalysisFailed,
    handleFileUpload,
    processArtworkFiles,
    handleSessionCaptureSubmit,
    ingestPreparedUploads,
  };
}
