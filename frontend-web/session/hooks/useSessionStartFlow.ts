import { startTransition, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  PreparedSessionUploadEntry,
  PreparedUploadIngestResult,
  PreparedUploadSessionContext,
} from '../../artwork-ingest/types';
import type { ArtworkWorkspace, GalleryItem } from '../../types';
import { startSessionWithArtworks } from '../api/sessions';
import { buildPreparedSessionFallbackPrompt } from '../lib/preparedSession';
import { newSessionEventId, updateSessionLinkForItem } from '../lib/sessionLinks';
import type { PendingSessionArtwork, SessionDraft, SessionStreamMessage } from '../types';

type ToastType = 'info' | 'success';
type ShowToast = (message: string, type?: ToastType) => void;

type AppTab = 'newSession' | 'collect' | 'profile' | 'learn';

type UseSessionStartFlowOptions = {
  defaultSessionTitle: string;
  sessionUserId: string;
  pendingSessionArtworks: PendingSessionArtwork[];
  newSessionDraftMessage: string;
  isSubmittingPreparedSession: boolean;
  setIsSubmittingPreparedSession: Dispatch<SetStateAction<boolean>>;
  refreshPersistedSessions: () => void;
  setSessionDrafts: Dispatch<SetStateAction<SessionDraft[]>>;
  setItems: Dispatch<SetStateAction<GalleryItem[]>>;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  setFilteredSessionId: Dispatch<SetStateAction<string | null>>;
  setIsComposingNewSession: Dispatch<SetStateAction<boolean>>;
  setVisit: Dispatch<SetStateAction<ArtworkWorkspace>>;
  resetPreparedSessionState: () => void;
  appendSessionEvents: (sessionId: string, newMessages: SessionStreamMessage[], options?: { persist?: boolean }) => void;
  persistSessionArtworkInput: (
    sessionId: string,
    artworks: Array<{ artworkId: string; source: 'upload' | 'capture' | 'library' }>,
    userInputEventId: string,
    content?: string,
  ) => void | Promise<void>;
  ingestPreparedUploads: (
    uploadEntries: PreparedSessionUploadEntry[],
    context: PreparedUploadSessionContext,
  ) => Promise<PreparedUploadIngestResult>;
  sendSessionInquiryToSession: (
    targetSessionId: string,
    text: string,
    sessionItemsOverride?: GalleryItem[],
    options?: {
      persistUserMessage?: boolean;
      parentEventIdOverride?: string;
      historyOverride?: SessionStreamMessage[];
      localUserMessageOverride?: SessionStreamMessage;
    },
  ) => void;
  showToast: ShowToast;
};

export function useSessionStartFlow({
  defaultSessionTitle,
  sessionUserId,
  pendingSessionArtworks,
  newSessionDraftMessage,
  isSubmittingPreparedSession,
  setIsSubmittingPreparedSession,
  refreshPersistedSessions,
  setSessionDrafts,
  setItems,
  setActiveTab,
  setFilteredSessionId,
  setIsComposingNewSession,
  setVisit,
  resetPreparedSessionState,
  appendSessionEvents,
  persistSessionArtworkInput,
  ingestPreparedUploads,
  sendSessionInquiryToSession,
  showToast,
}: UseSessionStartFlowOptions) {
  const submitPreparedSession = useCallback(async () => {
    if (pendingSessionArtworks.length === 0 || isSubmittingPreparedSession) {
      return;
    }

    setIsSubmittingPreparedSession(true);

    try {
      const libraryEntries = pendingSessionArtworks.filter(
        (entry): entry is Extract<PendingSessionArtwork, { kind: 'library' }> => entry.kind === 'library',
      );
      const uploadEntries = pendingSessionArtworks.filter(
        (entry): entry is Extract<PendingSessionArtwork, { kind: 'upload' }> => entry.kind === 'upload',
      );

      let sessionId = `session_${Math.random().toString(36).substring(2, 11)}`;
      let sessionTitle = defaultSessionTitle;
      let hasPersistedInitialCommit = false;

      if (libraryEntries.length > 0) {
        const started = await startSessionWithArtworks(
          sessionUserId,
          {
            session_id: sessionId,
            title: defaultSessionTitle,
            artwork_ids: libraryEntries.map((entry) => entry.artwork.artworkId || entry.artwork.id),
          },
        );
        sessionId = started?.session?.id || sessionId;
        sessionTitle = started?.session?.title || defaultSessionTitle;
        refreshPersistedSessions();
        hasPersistedInitialCommit = true;
      }

      const getSequenceNumber = (entryId: string) => pendingSessionArtworks.findIndex((entry) => entry.id === entryId);

      const resolvedSessionItems: GalleryItem[] = [];
      const libraryStreamMessages: SessionStreamMessage[] = [];
      const now = Date.now();
      let streamCursor = now;
      const batchUserInputEventId = newSessionEventId();
      setItems((prev) => prev.map((item) => {
        const matchingEntry = libraryEntries.find((entry) => entry.artwork.id === item.id);
        if (!matchingEntry) return item;
        const sequenceNumber = getSequenceNumber(matchingEntry.id);
        return updateSessionLinkForItem(item, sessionId, () => ({
          sessionId,
          sequenceNumber,
          source: 'library',
        }));
      }));

      libraryEntries.forEach((entry) => {
        const artworkId = entry.artwork.artworkId || entry.artwork.id;
        libraryStreamMessages.push(
          { id: `capture-${sessionId}-${artworkId}`, role: 'user', text: '', type: 'artwork_capture', artworkId, triggerEventId: batchUserInputEventId, createdAt: streamCursor++ },
          { id: `card-${sessionId}-${artworkId}`, role: 'model', text: '', type: 'artwork_card', artworkId, triggerEventId: batchUserInputEventId, createdAt: streamCursor++ },
        );
      });

      if (libraryStreamMessages.length > 0) {
        // Local-only: these legacy capture/card messages drive optimistic
        // rendering. Persistence happens via one canonical user_input event below.
        appendSessionEvents(sessionId, libraryStreamMessages, { persist: false });
      }
      resolvedSessionItems.push(...libraryEntries.map((entry, index) =>
        updateSessionLinkForItem(entry.artwork, sessionId, () => ({
          sessionId,
          sequenceNumber: index,
          source: 'library',
        })),
      ));

      let uploadAnalysisPromise: Promise<GalleryItem[]> | null = null;

      if (uploadEntries.length > 0) {
        const uploadIngestResult = await ingestPreparedUploads(uploadEntries, {
          sessionId,
          getSequenceNumber,
          userInputEventId: batchUserInputEventId,
        });
        resolvedSessionItems.push(...uploadIngestResult.persistedItems);
        uploadAnalysisPromise = uploadIngestResult.analysisPromise;
        if (uploadIngestResult.persistedItems.length > 0) {
          hasPersistedInitialCommit = true;
          refreshPersistedSessions();
        }
      }

      if (!hasPersistedInitialCommit || resolvedSessionItems.length === 0) {
        showToast('Couldn’t save the first artwork. Try again.', 'info');
        return;
      }

      // Persist the whole prepared batch as ONE canonical user_input event,
      // with each artwork's source. That user_input event becomes the shared
      // parent event id for the row.
      const inputEntries = resolvedSessionItems
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
      void persistSessionArtworkInput(
        sessionId,
        inputEntries,
        batchUserInputEventId,
        newSessionDraftMessage.trim() || undefined,
      );

      setSessionDrafts((prev) => [
        { id: sessionId, title: sessionTitle, createdAt: now, updatedAt: now },
        ...prev.filter((draft) => draft.id !== sessionId),
      ]);
      setActiveTab('newSession');
      setFilteredSessionId(sessionId);
      setIsComposingNewSession(false);
      setVisit({ id: sessionId, itemIds: resolvedSessionItems.map((item) => item.id), globalConversation: [] });
      startTransition(() => {
        resetPreparedSessionState();
      });

      const openingMessage = newSessionDraftMessage.trim();
      const localInputEntries = resolvedSessionItems
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
      const localUserInputEvent: SessionStreamMessage = {
        id: batchUserInputEventId,
        role: 'user',
        text: openingMessage,
        artworkIds: localInputEntries.map((entry) => entry.artworkId),
        payload: {
          artworks: localInputEntries.map((entry) => ({
            artwork_id: entry.artworkId,
            source: entry.source,
          })),
        },
        triggerEventId: batchUserInputEventId,
        createdAt: now + 1,
      };
      appendSessionEvents(sessionId, [localUserInputEvent], { persist: false });

      if (openingMessage && uploadAnalysisPromise) {
        void uploadAnalysisPromise.then((analyzedUploads) => {
          const sessionItemsForCommentary = [
            ...resolvedSessionItems.filter((item) => item.sessionLinks?.some((link) => link.sessionId === sessionId && link.source === 'library')),
            ...analyzedUploads,
          ];
          if (sessionItemsForCommentary.length === 0) {
            return;
          }
          sendSessionInquiryToSession(sessionId, openingMessage, sessionItemsForCommentary, {
            persistUserMessage: false,
            parentEventIdOverride: batchUserInputEventId,
            historyOverride: [localUserInputEvent],
          });
        });
      } else if (openingMessage) {
        window.setTimeout(() => {
          sendSessionInquiryToSession(sessionId, openingMessage, resolvedSessionItems, {
            persistUserMessage: false,
            parentEventIdOverride: batchUserInputEventId,
            historyOverride: [localUserInputEvent],
          });
        }, 0);
      } else if (uploadAnalysisPromise) {
        void uploadAnalysisPromise.then((analyzedUploads) => {
          if (analyzedUploads.length === 0) {
            return;
          }
          sendSessionInquiryToSession(
            sessionId,
            buildPreparedSessionFallbackPrompt(pendingSessionArtworks),
            [
              ...resolvedSessionItems.filter((item) => item.sessionLinks?.some((link) => link.sessionId === sessionId && link.source === 'library')),
              ...analyzedUploads,
            ],
            {
              persistUserMessage: false,
              parentEventIdOverride: batchUserInputEventId,
              historyOverride: [localUserInputEvent],
            },
          );
        });
      } else {
        window.setTimeout(() => {
          sendSessionInquiryToSession(
            sessionId,
            buildPreparedSessionFallbackPrompt(pendingSessionArtworks),
            resolvedSessionItems,
            {
              persistUserMessage: false,
              parentEventIdOverride: batchUserInputEventId,
              historyOverride: [localUserInputEvent],
            },
          );
        }, 0);
      }
    } catch (error) {
      console.error('Failed to start prepared session:', error);
      showToast('Could not start session from selected artworks.', 'info');
    } finally {
      setIsSubmittingPreparedSession(false);
    }
  }, [
    appendSessionEvents,
    defaultSessionTitle,
    ingestPreparedUploads,
    isSubmittingPreparedSession,
    newSessionDraftMessage,
    pendingSessionArtworks,
    persistSessionArtworkInput,
    refreshPersistedSessions,
    resetPreparedSessionState,
    sendSessionInquiryToSession,
    sessionUserId,
    setActiveTab,
    setFilteredSessionId,
    setIsComposingNewSession,
    setIsSubmittingPreparedSession,
    setItems,
    setVisit,
    setSessionDrafts,
    showToast,
  ]);

  return {
    submitPreparedSession,
  };
}
