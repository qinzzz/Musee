import { useCallback, useState } from 'react';
import { startTransition } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  PreparedSessionUploadEntry,
  PreparedUploadIngestResult,
  PreparedUploadSessionContext,
} from '../../artwork-ingest/types';
import type { ArtworkWorkspace, GalleryItem, SessionLink } from '../../types';
import { attachArtworksToSession } from '../api/sessions';
import { buildStagedSessionAdditionPrompt } from '../lib/preparedSession';
import { itemBelongsToSession, newSessionEventId, updateSessionLinkForItem } from '../lib/sessionLinks';
import { nextLocalOrder } from '../lib/sessionOrdering';
import {
  getNextLocalSessionEventCreatedAt,
  getNextSessionArtworkSequenceNumber,
} from '../../artwork-ingest/lib/uploadWorkflow';
import type { PendingSessionArtwork, SessionStreamMessage } from '../types';

type ToastType = 'info' | 'success';

type UseSessionStagedBatchOptions = {
  userId: string;
  items: GalleryItem[];
  sessionStreams: Record<string, SessionStreamMessage[]>;
  pendingSessionArtworks: PendingSessionArtwork[];
  resetPreparedSessionState: () => void;
  updateArtworkSessionLinks: (
    sessionId: string,
    resolveLink: (item: GalleryItem) => SessionLink | null | undefined,
  ) => void;
  appendSessionEvents: (
    sessionId: string,
    newMessages: SessionStreamMessage[],
    options?: { persist?: boolean },
  ) => void;
  persistSessionArtworkInput: (
    sessionId: string,
    artworks: Array<{ artworkId: string; source: 'upload' | 'capture' | 'library' }>,
    userInputEventId: string,
    content?: string,
  ) => Promise<void>;
  sendSessionInquiryToSession: (
    targetSessionId: string,
    text: string,
    sessionItemsOverride?: GalleryItem[],
    options?: {
      persistUserMessage?: boolean;
      parentEventIdOverride?: string;
      historyOverride?: SessionStreamMessage[];
    },
  ) => void;
  ingestPreparedUploads: (
    uploadEntries: PreparedSessionUploadEntry[],
    context: PreparedUploadSessionContext,
  ) => Promise<PreparedUploadIngestResult>;
  setVisit: Dispatch<SetStateAction<ArtworkWorkspace>>;
  refreshPersistedSessions: () => void;
  showToast: (message: string, type?: ToastType) => void;
};

// Submits the staged artwork batch (library picks + uploads) to an ONGOING
// session as one turn: one shared user_input event carrying the artworks and
// the optional message. The new-session counterpart is useSessionStartFlow.
export function useSessionStagedBatch({
  userId,
  items,
  sessionStreams,
  pendingSessionArtworks,
  resetPreparedSessionState,
  updateArtworkSessionLinks,
  appendSessionEvents,
  persistSessionArtworkInput,
  sendSessionInquiryToSession,
  ingestPreparedUploads,
  setVisit,
  refreshPersistedSessions,
  showToast,
}: UseSessionStagedBatchOptions) {
  const [isSubmittingStagedBatch, setIsSubmittingStagedBatch] = useState(false);

  const submitStagedBatch = useCallback(async (sessionId: string, rawMessage: string): Promise<boolean> => {
    if (pendingSessionArtworks.length === 0 || isSubmittingStagedBatch) {
      return false;
    }

    setIsSubmittingStagedBatch(true);
    try {
      const message = rawMessage.trim();
      const libraryEntries = pendingSessionArtworks.filter(
        (entry): entry is Extract<PendingSessionArtwork, { kind: 'library' }> => entry.kind === 'library',
      );
      const uploadEntries = pendingSessionArtworks.filter(
        (entry): entry is Extract<PendingSessionArtwork, { kind: 'upload' }> => entry.kind === 'upload',
      );

      const batchUserInputEventId = newSessionEventId();
      const startingSequenceNumber = getNextSessionArtworkSequenceNumber(items, sessionId);
      const getSequenceNumber = (entryId: string) =>
        startingSequenceNumber + pendingSessionArtworks.findIndex((entry) => entry.id === entryId);
      // Snapshot before we append optimistic events, so the inquiry trigger
      // isn't duplicated in the history it streams against.
      const historySnapshot = sessionStreams[sessionId] || [];

      const resolvedLibraryItems: GalleryItem[] = [];
      if (libraryEntries.length > 0) {
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
          if (sequenceNumber === undefined) return undefined;
          return { sessionId, sequenceNumber, source: 'library' };
        });
        resolvedLibraryItems.push(...libraryEntries.map((entry) =>
          updateSessionLinkForItem(entry.artwork, sessionId, () => ({
            sessionId,
            sequenceNumber: sequenceByClientId.get(entry.artwork.id)!,
            source: 'library',
          })),
        ));

        let createdAtCursor = getNextLocalSessionEventCreatedAt(historySnapshot);
        const libraryStreamMessages: SessionStreamMessage[] = [];
        libraryEntries.forEach((entry) => {
          const artworkId = entry.artwork.artworkId || entry.artwork.id;
          libraryStreamMessages.push(
            { id: `capture-${sessionId}-${artworkId}`, role: 'user', text: '', type: 'artwork_capture', artworkId, triggerEventId: batchUserInputEventId, createdAt: createdAtCursor++, localOrder: nextLocalOrder() },
            { id: `card-${sessionId}-${artworkId}`, role: 'model', text: '', type: 'artwork_card', artworkId, triggerEventId: batchUserInputEventId, createdAt: createdAtCursor++, localOrder: nextLocalOrder() },
          );
        });
        appendSessionEvents(sessionId, libraryStreamMessages, { persist: false });

        const attachedClientIds = libraryEntries.map((entry) => entry.artwork.id);
        setVisit((prev) => (
          prev.id === sessionId
            ? { ...prev, itemIds: [...prev.itemIds, ...attachedClientIds.filter((id) => !prev.itemIds.includes(id))] }
            : prev
        ));
      }

      let uploadAnalysisPromise: Promise<GalleryItem[]> | null = null;
      const persistedUploadItems: GalleryItem[] = [];
      if (uploadEntries.length > 0) {
        const uploadIngestResult = await ingestPreparedUploads(uploadEntries, {
          sessionId,
          getSequenceNumber,
          userInputEventId: batchUserInputEventId,
        });
        persistedUploadItems.push(...uploadIngestResult.persistedItems);
        uploadAnalysisPromise = uploadIngestResult.analysisPromise;
      }

      const resolvedNewItems = [...resolvedLibraryItems, ...persistedUploadItems];
      if (resolvedNewItems.length === 0) {
        showToast('Couldn’t add the artworks. Try again.', 'info');
        return false;
      }

      const inputEntries = resolvedNewItems
        .map((item) => {
          const link = item.sessionLinks?.find((sessionLink) => sessionLink.sessionId === sessionId);
          const source: 'upload' | 'capture' | 'library' = link?.source === 'library'
            ? 'library'
            : link?.source === 'camera'
              ? 'capture'
              : 'upload';
          return { artworkId: item.artworkId || item.id, source };
        })
        .filter((entry) => entry.artworkId);

      void persistSessionArtworkInput(sessionId, inputEntries, batchUserInputEventId, message || undefined);

      const localUserInputEvent: SessionStreamMessage = {
        id: batchUserInputEventId,
        role: 'user',
        text: message,
        artworkIds: inputEntries.map((entry) => entry.artworkId),
        payload: {
          artworks: inputEntries.map((entry) => ({
            artwork_id: entry.artworkId,
            source: entry.source,
          })),
        },
        triggerEventId: batchUserInputEventId,
        createdAt: getNextLocalSessionEventCreatedAt(sessionStreams[sessionId] || historySnapshot),
        localOrder: nextLocalOrder(),
      };
      appendSessionEvents(sessionId, [localUserInputEvent], { persist: false });

      refreshPersistedSessions();
      startTransition(() => {
        resetPreparedSessionState();
      });

      const existingSessionItems = items.filter((item) =>
        itemBelongsToSession(item, sessionId)
        && !resolvedNewItems.some((newItem) => newItem.id === item.id));
      const inquiryText = message || buildStagedSessionAdditionPrompt(pendingSessionArtworks);
      const inquiryOptions = {
        persistUserMessage: false,
        parentEventIdOverride: batchUserInputEventId,
        historyOverride: historySnapshot,
      };

      if (uploadAnalysisPromise) {
        void uploadAnalysisPromise.then((analyzedUploads) => {
          const sessionItemsForInquiry = [
            ...resolvedLibraryItems,
            ...analyzedUploads,
            ...existingSessionItems,
          ];
          if (sessionItemsForInquiry.length === 0) return;
          sendSessionInquiryToSession(sessionId, inquiryText, sessionItemsForInquiry, inquiryOptions);
        });
      } else {
        window.setTimeout(() => {
          sendSessionInquiryToSession(
            sessionId,
            inquiryText,
            [...resolvedNewItems, ...existingSessionItems],
            inquiryOptions,
          );
        }, 0);
      }

      return true;
    } catch (error) {
      console.error('Failed to add staged artworks to session:', error);
      showToast('Couldn’t add artworks to this session. Try again.', 'info');
      return false;
    } finally {
      setIsSubmittingStagedBatch(false);
    }
  }, [
    appendSessionEvents,
    ingestPreparedUploads,
    isSubmittingStagedBatch,
    items,
    pendingSessionArtworks,
    persistSessionArtworkInput,
    refreshPersistedSessions,
    resetPreparedSessionState,
    sendSessionInquiryToSession,
    sessionStreams,
    setVisit,
    showToast,
    updateArtworkSessionLinks,
    userId,
  ]);

  return {
    isSubmittingStagedBatch,
    submitStagedBatch,
  };
}
