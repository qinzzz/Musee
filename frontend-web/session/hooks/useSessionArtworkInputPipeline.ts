import { startTransition, useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  PreparedSessionUploadEntry,
  PreparedUploadIngestResult,
  PreparedUploadSessionContext,
} from '../../artwork-ingest/types';
import type { ArtworkWorkspace, GalleryItem, SessionLink } from '../../types';
import { buildBatchUploadFailureMessage } from '../../lib/uploadValidation';
import {
  attachArtworksToSession,
  startSessionWithArtworks,
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

  const runInputPipeline = useCallback(async (
    target: InputTarget,
    inputArtworks: PendingSessionArtwork[] = pendingSessionArtworks,
  ): Promise<boolean> => {
    if (inputArtworks.length === 0) return false;
    if (target.kind === 'new' ? isSubmittingPreparedSession : isSubmittingStagedBatch) return false;

    const setSubmitting = target.kind === 'new'
      ? setIsSubmittingPreparedSession
      : setIsSubmittingStagedBatch;
    setSubmitting(true);

    let optimisticSessionId: string | null = null;
    let optimisticEventId: string | null = null;
    let hasResolvedArtwork = false;
    let failurePhase: PipelineFailurePhase = target.kind === 'new'
      ? 'starting-session'
      : 'linking-artworks';

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
      let sessionId = provisionalSessionId;
      let sessionTitle = defaultSessionTitle;

      if (isNewSession && libraryEntries.length > 0) {
        const started = await startSessionWithArtworks(userId, {
          session_id: provisionalSessionId,
          title: defaultSessionTitle,
          artwork_ids: libraryEntries.map((entry) => entry.artwork.artworkId || entry.artwork.id),
        });
        sessionId = started?.session?.id || provisionalSessionId;
        sessionTitle = started?.session?.title || defaultSessionTitle;
      }

      optimisticSessionId = sessionId;
      optimisticEventId = eventId;

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

      const resolvedLibraryItems = libraryEntries.map((entry) => (
        updateSessionLinkForItem(entry.artwork, sessionId, () => ({
          sessionId,
          sequenceNumber: getSequenceNumber(entry.id),
          source: 'library',
        }))
      ));

      if (libraryEntries.length > 0) {
        if (!isNewSession) {
          await attachArtworksToSession(
            sessionId,
            userId,
            libraryEntries.map((entry) => entry.artwork.artworkId || entry.artwork.id),
          );
        }
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
        setSessionStreams((prev) => ({
          ...prev,
          [sessionId]: (prev[sessionId] || []).filter((event) => event.id !== eventId),
        }));
        const uploadFailureMessage = buildBatchUploadFailureMessage(
          uploadResult?.failedEntries.map((entry) => entry.message) || [],
          0,
        );
        showToast(uploadFailureMessage || (
          isNewSession
            ? 'Musee couldn’t save the first artwork. Check your connection and try again.'
            : 'None of the selected artworks could be added. Check your connection and try again.'
        ), 'info');
        return false;
      }
      hasResolvedArtwork = true;

      const partialUploadFailureMessage = buildBatchUploadFailureMessage(
        uploadResult?.failedEntries.map((entry) => entry.message) || [],
        resolvedItems.length,
      );
      if (partialUploadFailureMessage) {
        showToast(partialUploadFailureMessage, 'info');
      }

      publishOptimisticEvent();
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
        setSessionDrafts((prev) => [
          { id: sessionId, title: sessionTitle, createdAt, updatedAt: createdAt },
          ...prev.filter((draft) => draft.id !== sessionId),
        ]);
        setActiveTab('newSession');
        setFilteredSessionId(sessionId);
        setIsComposingNewSession(false);
        setVisit({
          id: sessionId,
          itemIds: resolvedItems.map((item) => item.id),
          globalConversation: [],
        });
      }

      startTransition(() => resetPreparedSessionState());
      // Raw artwork and canonical input persistence are complete. From here
      // the artwork records themselves expose the analyzing state, so the
      // shared session indicator can advance from "adding" to "analyzing".
      setSubmitting(false);

      const analysisPromise = uploadResult?.analysisPromise || Promise.resolve([]);
      const analyzedUploads = await analysisPromise;
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
      if (optimisticSessionId && optimisticEventId) {
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
      if (hasResolvedArtwork) {
        startTransition(() => resetPreparedSessionState());
      }
      const failureMessage = failurePhase === 'saving-session-turn' && hasResolvedArtwork
        ? 'The artworks were saved, but Musee couldn’t finish updating the session. Refresh to check the session.'
        : failurePhase === 'linking-artworks'
          ? 'Musee couldn’t link these artworks to the session. They’re still in your collection.'
          : target.kind === 'new'
            ? 'Musee couldn’t start the session. Check your connection and try again.'
            : 'Musee couldn’t add these artworks. Check your connection and try again.';
      showToast(failureMessage, 'info');
      return false;
    } finally {
      setSubmitting(false);
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
    persistSessionArtworkInput,
    refreshPersistedSessions,
    resetPreparedSessionState,
    sendSessionInquiryToSession,
    sessionStreams,
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
    await runInputPipeline({ kind: 'new' });
  }, [runInputPipeline]);

  const submitStagedBatch = useCallback(
    (sessionId: string, message: string) => runInputPipeline({ kind: 'existing', sessionId, message }),
    [runInputPipeline],
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
    submitPreparedSession,
    submitStagedBatch,
    submitImmediateArtwork,
  };
}
