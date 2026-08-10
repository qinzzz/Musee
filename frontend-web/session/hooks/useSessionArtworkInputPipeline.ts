import { startTransition, useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  PreparedSessionUploadEntry,
  PreparedUploadIngestResult,
  PreparedUploadSessionContext,
} from '../../artwork-ingest/types';
import type { ArtworkWorkspace, GalleryItem, SessionLink } from '../../types';
import {
  buildBatchUploadFailureMessage,
  getArtworkUploadFailureCode,
} from '../../lib/uploadValidation';
import {
  attachArtworksToSession,
  ensureSession,
} from '../api/sessions';
import { buildArtworkInputEntries } from '../lib/batchEvents';
import {
  buildPreparedSessionFallbackPrompt,
  buildStagedSessionAdditionPrompt,
} from '../lib/preparedSession';
import {
  itemBelongsToSession,
  newSessionEventId,
  updateSessionLinkForItem,
} from '../lib/sessionLinks';
import { nextLocalOrder } from '../lib/sessionOrdering';
import { buildInitialSessionTitle } from '../lib/sessionCreation';
import {
  getSessionUploadFailureStatus,
  SESSION_FAILURE_MESSAGES,
  shouldShowInlineSessionUploadFailure,
  type SessionFailureKind,
} from '../lib/sessionFailureStatus';
import {
  getNextLocalSessionEventCreatedAt,
  getNextSessionArtworkSequenceNumber,
} from '../../artwork-ingest/lib/uploadWorkflow';
import type {
  PendingSessionArtwork,
  SessionDraft,
  SessionStreamMessage,
} from '../types';

type AppTab = 'newSession' | 'collect' | 'profile' | 'learn';
type ToastType = 'info' | 'success';
type ArtworkInputSource = 'upload' | 'capture' | 'library';
type PipelineFailurePhase = 'starting-session' | 'linking-artworks' | 'uploading-artworks' | 'saving-session-turn';

type InputTarget =
  | { kind: 'new' }
  | { kind: 'existing'; sessionId: string; message: string };

type UseSessionArtworkInputPipelineOptions = {
  userId: string;
  defaultSessionTitle: string;
  items: GalleryItem[];
  persistedSessionIds: string[];
  sessionTitleById: Record<string, string>;
  sessionStreams: Record<string, SessionStreamMessage[]>;
  pendingSessionArtworks: PendingSessionArtwork[];
  newSessionDraftMessage: string;
  isSubmittingPreparedSession: boolean;
  setIsSubmittingPreparedSession: Dispatch<SetStateAction<boolean>>;
  refreshPersistedSessions: () => void;
  setSessionDrafts: Dispatch<SetStateAction<SessionDraft[]>>;
  updateArtworkSessionLinks: (
    sessionId: string,
    resolveLink: (item: GalleryItem) => SessionLink | null | undefined,
  ) => void;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  setFilteredSessionId: Dispatch<SetStateAction<string | null>>;
  setIsComposingNewSession: Dispatch<SetStateAction<boolean>>;
  setVisit: Dispatch<SetStateAction<ArtworkWorkspace>>;
  setSessionStreams: Dispatch<SetStateAction<Record<string, SessionStreamMessage[]>>>;
  resetPreparedSessionState: () => void;
  appendSessionEvents: (
    sessionId: string,
    messages: SessionStreamMessage[],
    options?: { persist?: boolean },
  ) => void;
  persistSessionArtworkInput: (
    sessionId: string,
    artworks: Array<{ artworkId: string; source: ArtworkInputSource }>,
    userInputEventId: string,
    content?: string,
  ) => Promise<void>;
  ingestPreparedUploads: (
    uploadEntries: PreparedSessionUploadEntry[],
    context: PreparedUploadSessionContext,
  ) => Promise<PreparedUploadIngestResult>;
  sendSessionInquiryToSession: (
    sessionId: string,
    text: string,
    sessionItems?: GalleryItem[],
    options?: {
      persistUserMessage?: boolean;
      parentEventIdOverride?: string;
      historyOverride?: SessionStreamMessage[];
    },
  ) => void;
  showToast: (message: string, type?: ToastType) => void;
};

const pendingEntrySource = (entry: PendingSessionArtwork): ArtworkInputSource => {
  if (entry.kind === 'library') return 'library';
  return entry.mode === 'camera' ? 'capture' : 'upload';
};

export function useSessionArtworkInputPipeline({
  userId,
  defaultSessionTitle,
  items,
  persistedSessionIds,
  sessionTitleById,
  sessionStreams,
  pendingSessionArtworks,
  newSessionDraftMessage,
  isSubmittingPreparedSession,
  setIsSubmittingPreparedSession,
  refreshPersistedSessions,
  setSessionDrafts,
  updateArtworkSessionLinks,
  setActiveTab,
  setFilteredSessionId,
  setIsComposingNewSession,
  setVisit,
  setSessionStreams,
  resetPreparedSessionState,
  appendSessionEvents,
  persistSessionArtworkInput,
  ingestPreparedUploads,
  sendSessionInquiryToSession,
  showToast,
}: UseSessionArtworkInputPipelineOptions) {
  const [isSubmittingStagedBatch, setIsSubmittingStagedBatch] = useState(false);
  const [activeInputPipelineSessionId, setActiveInputPipelineSessionId] = useState<string | null>(null);
  const submissionInFlightRef = useRef(false);

  const runInputPipeline = useCallback(async (
    target: InputTarget,
    inputArtworks: PendingSessionArtwork[] = pendingSessionArtworks,
    clearPreparedDraftOnStart = false,
  ): Promise<boolean> => {
    if (inputArtworks.length === 0) return false;
    if (submissionInFlightRef.current) return false;
    if (target.kind === 'new' ? isSubmittingPreparedSession : isSubmittingStagedBatch) return false;
    submissionInFlightRef.current = true;
    if (clearPreparedDraftOnStart) {
      resetPreparedSessionState();
    }

    const setSubmitting = target.kind === 'new'
      ? setIsSubmittingPreparedSession
      : setIsSubmittingStagedBatch;
    setSubmitting(true);

    let optimisticSessionId: string | null = null;
    let optimisticEventId: string | null = null;
    let hasResolvedArtwork = false;
    let hasPersistedSession = target.kind === 'existing'
      && persistedSessionIds.includes(target.sessionId);
    let failurePhase: PipelineFailurePhase = target.kind === 'new'
      ? 'starting-session'
      : 'linking-artworks';

    const publishLocalFailureStatus = (
      sessionId: string,
      message: string,
      messageKind: SessionFailureKind,
      errorCode: string,
      options: { replaceEventId?: string; triggerEventId?: string } = {},
    ) => {
      const statusId = newSessionEventId();
      const statusLocalOrder = nextLocalOrder();
      setSessionStreams((prev) => {
        const currentEvents = prev[sessionId] || [];
        const events = options.replaceEventId
          ? currentEvents.filter((entry) => entry.id !== options.replaceEventId)
          : currentEvents;
        return {
          ...prev,
          [sessionId]: [
            ...events,
            {
              id: statusId,
              role: 'model',
              type: 'text',
              text: message,
              payload: {
                message_kind: messageKind,
                error_code: errorCode,
              },
              triggerEventId: options.triggerEventId,
              createdAt: getNextLocalSessionEventCreatedAt(events),
              localOrder: statusLocalOrder,
            },
          ],
        };
      });
    };

    try {
      const libraryEntries = inputArtworks.filter(
        (entry): entry is Extract<PendingSessionArtwork, { kind: 'library' }> => entry.kind === 'library',
      );
      const uploadEntries = inputArtworks.filter(
        (entry): entry is PreparedSessionUploadEntry => entry.kind === 'upload',
      );
      const isNewSession = target.kind === 'new';
      const message = (isNewSession ? newSessionDraftMessage : target.message).trim();
      const historySnapshot = isNewSession ? [] : sessionStreams[target.sessionId] || [];
      const createdAt = getNextLocalSessionEventCreatedAt(historySnapshot);
      const eventId = newSessionEventId();
      const localOrder = nextLocalOrder();
      const provisionalSessionId = isNewSession
        ? `session_${Math.random().toString(36).substring(2, 11)}`
        : target.sessionId;
      const sessionId = provisionalSessionId;
      let sessionTitle = isNewSession
        ? buildInitialSessionTitle(message, defaultSessionTitle)
        : sessionTitleById[sessionId] || defaultSessionTitle;

      optimisticSessionId = sessionId;
      optimisticEventId = eventId;
      setActiveInputPipelineSessionId(sessionId);

      if (isNewSession) {
        setSessionDrafts((prev) => [
          { id: sessionId, title: sessionTitle, createdAt, updatedAt: createdAt },
          ...prev.filter((draft) => draft.id !== sessionId),
        ]);
        setActiveTab('newSession');
        setFilteredSessionId(sessionId);
        setIsComposingNewSession(false);
        setVisit({
          id: sessionId,
          itemIds: [],
          globalConversation: [],
        });
      }

      const sequenceStart = isNewSession
        ? 0
        : getNextSessionArtworkSequenceNumber(items, sessionId);
      const getSequenceNumber = (entryId: string) => (
        sequenceStart + inputArtworks.findIndex((entry) => entry.id === entryId)
      );
      const displayedIdsByEntryId = new Map<string, string | undefined>(
        inputArtworks.map((entry) => [
          entry.id,
          entry.kind === 'library' ? entry.artwork.artworkId || entry.artwork.id : undefined,
        ]),
      );
      const placeholderIdsByEntryId = new Map<string, string>();

      const publishOptimisticEvent = () => {
        const entries = inputArtworks
          .map((entry) => ({
            artworkId: displayedIdsByEntryId.get(entry.id),
            source: pendingEntrySource(entry),
          }))
          .filter((entry): entry is { artworkId: string; source: ArtworkInputSource } => Boolean(entry.artworkId));
        appendSessionEvents(sessionId, [{
          id: eventId,
          role: 'user',
          type: 'text',
          text: message,
          artworkIds: entries.map((entry) => entry.artworkId),
          payload: {
            artworks: entries.map((entry) => ({
              artwork_id: entry.artworkId,
              source: entry.source,
            })),
          },
          triggerEventId: eventId,
          createdAt,
          localOrder,
        }], { persist: false });
      };

      // Establish the turn before any placeholder can enter artwork state.
      // Upload entry ids do not resolve yet, so they remain visually silent
      // until onPlaceholdersReady patches this same event with client ids.
      publishOptimisticEvent();

      const shouldEnsureSession = isNewSession || !persistedSessionIds.includes(sessionId);
      if (shouldEnsureSession) {
        failurePhase = 'starting-session';
        const persistedSession = await ensureSession(userId, sessionId, sessionTitle);
        hasPersistedSession = true;
        sessionTitle = persistedSession.title || sessionTitle;
        setSessionDrafts((prev) => prev.map((draft) => (
          draft.id === sessionId
            ? { ...draft, title: sessionTitle, updatedAt: Date.now() }
            : draft
        )));
        refreshPersistedSessions();
      }

      const resolvedLibraryItems = libraryEntries.map((entry) => (
        updateSessionLinkForItem(entry.artwork, sessionId, () => ({
          sessionId,
          sequenceNumber: getSequenceNumber(entry.id),
          source: 'library',
        }))
      ));

      if (libraryEntries.length > 0) {
        failurePhase = 'linking-artworks';
        await attachArtworksToSession(
          sessionId,
          userId,
          libraryEntries.map((entry) => entry.artwork.artworkId || entry.artwork.id),
        );
        const sequenceByClientId = new Map(
          libraryEntries.map((entry) => [entry.artwork.id, getSequenceNumber(entry.id)]),
        );
        updateArtworkSessionLinks(sessionId, (item) => {
          const sequenceNumber = sequenceByClientId.get(item.id);
          return sequenceNumber === undefined
            ? undefined
            : { sessionId, sequenceNumber, source: 'library' };
        });
        setVisit((prev) => ({
          ...prev,
          id: sessionId,
          itemIds: [
            ...prev.itemIds,
            ...libraryEntries
              .map((entry) => entry.artwork.id)
              .filter((id) => !prev.itemIds.includes(id)),
          ],
        }));
        hasResolvedArtwork = resolvedLibraryItems.length > 0;
      }

      let uploadResult: PreparedUploadIngestResult | null = null;
      if (uploadEntries.length > 0) {
        failurePhase = 'uploading-artworks';
        uploadResult = await ingestPreparedUploads(uploadEntries, {
          sessionId,
          getSequenceNumber,
          onPlaceholdersReady: (placeholders) => {
            placeholders.forEach(({ entryId, item }) => {
              displayedIdsByEntryId.set(entryId, item.id);
              placeholderIdsByEntryId.set(entryId, item.id);
            });
            publishOptimisticEvent();
            setVisit((prev) => ({
              ...prev,
              id: sessionId,
              itemIds: [
                ...prev.itemIds,
                ...placeholders
                  .map(({ item }) => item.id)
                  .filter((id) => !prev.itemIds.includes(id)),
              ],
            }));
          },
        });
      }

      const persistedEntries = uploadResult?.persistedEntries || [];
      const successfulUploadEntryIds = new Set(persistedEntries.map((entry) => entry.entryId));
      uploadEntries.forEach((entry) => {
        if (!successfulUploadEntryIds.has(entry.id)) displayedIdsByEntryId.delete(entry.id);
      });
      const failedPlaceholderIds = new Set(
        uploadEntries
          .filter((entry) => !successfulUploadEntryIds.has(entry.id))
          .map((entry) => placeholderIdsByEntryId.get(entry.id))
          .filter((id): id is string => Boolean(id)),
      );
      if (failedPlaceholderIds.size > 0) {
        setVisit((prev) => ({
          ...prev,
          itemIds: prev.itemIds.filter((id) => !failedPlaceholderIds.has(id)),
        }));
      }
      persistedEntries.forEach(({ entryId, item }) => {
        if (entryId && item.artworkId) displayedIdsByEntryId.set(entryId, item.artworkId);
      });

      const persistedUploadItems = persistedEntries.map((entry) => entry.item);
      const resolvedItems = [...resolvedLibraryItems, ...persistedUploadItems];
      if (resolvedItems.length === 0) {
        const uploadFailureCodes = uploadResult?.failedEntries.map((entry) => entry.errorCode) || [];
        const uploadFailureStatus = getSessionUploadFailureStatus(
          uploadFailureCodes,
        );
        const shouldShowInlineFailure = hasPersistedSession
          && shouldShowInlineSessionUploadFailure(uploadFailureCodes);
        if (shouldShowInlineFailure) {
          publishLocalFailureStatus(
            sessionId,
            uploadFailureStatus.message,
            'upload_failure',
            uploadFailureStatus.errorCode,
            { replaceEventId: eventId },
          );
        } else {
          setSessionStreams((prev) => ({
            ...prev,
            [sessionId]: (prev[sessionId] || []).filter((event) => event.id !== eventId),
          }));
        }
        const uploadFailureMessage = buildBatchUploadFailureMessage(
          uploadResult?.failedEntries.map((entry) => entry.message) || [],
          0,
        );
        if (!shouldShowInlineFailure) {
          showToast(
            uploadFailureMessage || (
              isNewSession
                ? 'Musee couldn’t save the first artwork. Check your connection and try again.'
                : 'None of the selected artworks could be added. Check your connection and try again.'
            ),
            'info',
          );
        }
        return false;
      }
      hasResolvedArtwork = true;

      const partialUploadFailureMessage = buildBatchUploadFailureMessage(
        uploadResult?.failedEntries.map((entry) => entry.message) || [],
        resolvedItems.length,
      );
      publishOptimisticEvent();
      if (partialUploadFailureMessage) {
        const uploadFailureCodes = uploadResult?.failedEntries.map((entry) => entry.errorCode) || [];
        const uploadFailureStatus = getSessionUploadFailureStatus(
          uploadFailureCodes,
        );
        if (shouldShowInlineSessionUploadFailure(uploadFailureCodes)) {
          publishLocalFailureStatus(
            sessionId,
            uploadFailureStatus.message,
            'upload_failure',
            uploadFailureStatus.errorCode,
            { triggerEventId: eventId },
          );
        } else {
          showToast(partialUploadFailureMessage, 'info');
        }
      }
      const inputEntries = buildArtworkInputEntries(resolvedItems, sessionId);
      failurePhase = 'saving-session-turn';
      try {
        await persistSessionArtworkInput(sessionId, inputEntries, eventId, message || undefined);
      } catch (_firstError) {
        // The event endpoint is idempotent by event id. One bounded retry
        // closes transient network gaps without risking duplicate turns.
        await persistSessionArtworkInput(sessionId, inputEntries, eventId, message || undefined);
      }
      refreshPersistedSessions();

      if (isNewSession) {
        setVisit({
          id: sessionId,
          itemIds: resolvedItems.map((item) => item.id),
          globalConversation: [],
        });
      }

      if (!clearPreparedDraftOnStart) {
        startTransition(() => resetPreparedSessionState());
      }
      // Raw artwork and canonical input persistence are complete. From here
      // the artwork records themselves expose the analyzing state, so the
      // shared session indicator can advance from "adding" to "analyzing".
      setSubmitting(false);

      const analysisPromise = uploadResult?.analysisPromise || Promise.resolve([]);
      const analysisFailureCountPromise = uploadResult?.analysisFailureCountPromise || Promise.resolve(0);
      const [analyzedUploads, analysisFailureCount] = await Promise.all([
        analysisPromise,
        analysisFailureCountPromise,
      ]);
      if (analysisFailureCount > 0) {
        publishLocalFailureStatus(
          sessionId,
          SESSION_FAILURE_MESSAGES.analysis,
          'analysis_failure',
          'analysis_failed',
          { triggerEventId: eventId },
        );
      }
      const libraryItems = resolvedItems.filter((item) => (
        item.sessionLinks?.some((link) => link.sessionId === sessionId && link.source === 'library')
      ));
      const newlyResolvedItems = [...libraryItems, ...analyzedUploads];
      if (newlyResolvedItems.length === 0) return true;

      const existingSessionItems = isNewSession
        ? []
        : items.filter((item) => (
          itemBelongsToSession(item, sessionId)
          && !resolvedItems.some((newItem) => newItem.id === item.id)
        ));
      const inquiryText = message || (
        isNewSession
          ? buildPreparedSessionFallbackPrompt(inputArtworks)
          : buildStagedSessionAdditionPrompt(inputArtworks)
      );
      sendSessionInquiryToSession(
        sessionId,
        inquiryText,
        [...newlyResolvedItems, ...existingSessionItems],
        {
          persistUserMessage: false,
          parentEventIdOverride: eventId,
          historyOverride: historySnapshot,
        },
      );

      return true;
    } catch (error) {
      console.error('Failed to submit artwork input:', error);
      const shouldShowInlineUploadFailure = Boolean(
        optimisticSessionId
        && optimisticEventId
        && hasPersistedSession
        && failurePhase === 'uploading-artworks',
      );
      const shouldShowInlineSessionFailure = Boolean(
        optimisticSessionId
        && optimisticEventId
        && failurePhase === 'starting-session',
      );
      if (shouldShowInlineSessionFailure && optimisticSessionId && optimisticEventId) {
        publishLocalFailureStatus(
          optimisticSessionId,
          SESSION_FAILURE_MESSAGES.session,
          'session_failure',
          'session_save_failed',
          { triggerEventId: optimisticEventId },
        );
        refreshPersistedSessions();
      } else if (shouldShowInlineUploadFailure && optimisticSessionId && optimisticEventId) {
        const uploadFailureStatus = getSessionUploadFailureStatus([
          getArtworkUploadFailureCode(error),
        ]);
        publishLocalFailureStatus(
          optimisticSessionId,
          uploadFailureStatus.message,
          'upload_failure',
          uploadFailureStatus.errorCode,
          hasResolvedArtwork
            ? { triggerEventId: optimisticEventId }
            : { replaceEventId: optimisticEventId },
        );
      } else if (optimisticSessionId && optimisticEventId) {
        // Keep successfully uploaded artwork visible, but remove the optimistic
        // turn if attachment/upload failed before anything became durable.
        setSessionStreams((prev) => {
          const events = prev[optimisticSessionId!] || [];
          if (hasResolvedArtwork) return prev;
          return {
            ...prev,
            [optimisticSessionId!]: events.filter((entry) => entry.id !== optimisticEventId),
          };
        });
      }
      if (hasResolvedArtwork && !clearPreparedDraftOnStart) {
        startTransition(() => resetPreparedSessionState());
      }
      if (!shouldShowInlineUploadFailure && !shouldShowInlineSessionFailure) {
        const failureMessage = failurePhase === 'saving-session-turn' && hasResolvedArtwork
          ? 'The artworks were saved, but Musee couldn’t finish updating the session. Refresh to check the session.'
          : failurePhase === 'linking-artworks'
            ? 'Musee couldn’t link these artworks to the session. They’re still in your collection.'
            : target.kind === 'new'
              ? 'Musee couldn’t start the session. Check your connection and try again.'
              : 'Musee couldn’t add these artworks. Check your connection and try again.';
        showToast(failureMessage, 'info');
      }
      return false;
    } finally {
      submissionInFlightRef.current = false;
      setSubmitting(false);
      setActiveInputPipelineSessionId(null);
    }
  }, [
    appendSessionEvents,
    defaultSessionTitle,
    ingestPreparedUploads,
    isSubmittingPreparedSession,
    isSubmittingStagedBatch,
    items,
    newSessionDraftMessage,
    pendingSessionArtworks,
    persistedSessionIds,
    persistSessionArtworkInput,
    refreshPersistedSessions,
    resetPreparedSessionState,
    sendSessionInquiryToSession,
    sessionStreams,
    sessionTitleById,
    setActiveTab,
    setFilteredSessionId,
    setIsComposingNewSession,
    setIsSubmittingPreparedSession,
    setSessionDrafts,
    setSessionStreams,
    setVisit,
    showToast,
    updateArtworkSessionLinks,
    userId,
  ]);

  const submitPreparedSession = useCallback(async () => {
    const submittedArtworks = pendingSessionArtworks;
    await runInputPipeline({ kind: 'new' }, submittedArtworks, true);
  }, [pendingSessionArtworks, runInputPipeline]);

  const submitStagedBatch = useCallback(
    (sessionId: string, message: string) => {
      const submittedArtworks = pendingSessionArtworks;
      return runInputPipeline({ kind: 'existing', sessionId, message }, submittedArtworks, true);
    },
    [pendingSessionArtworks, runInputPipeline],
  );

  const submitImmediateArtwork = useCallback((
    artwork: Extract<PendingSessionArtwork, { kind: 'upload' }>,
    sessionId?: string,
  ) => runInputPipeline(
    sessionId
      ? { kind: 'existing', sessionId, message: '' }
      : { kind: 'new' },
    [artwork],
  ), [runInputPipeline]);

  return {
    isSubmittingStagedBatch,
    activeInputPipelineSessionId,
    submitPreparedSession,
    submitStagedBatch,
    submitImmediateArtwork,
  };
}
