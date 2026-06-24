import { startTransition, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { PreparedSessionUploadEntry, PreparedUploadSessionContext } from '../../artwork-ingest/types';
import type { GalleryItem, Visit } from '../../types';
import { startSessionWithArtworks } from '../api/sessions';
import { buildPreparedSessionFallbackPrompt } from '../lib/preparedSession';
import { updateSessionLinkForItem } from '../lib/sessionLinks';
import type { PendingSessionArtwork, VisitDraft, VisitStreamMessage } from '../types';

type ToastType = 'info' | 'success';
type ShowToast = (message: string, type?: ToastType) => void;

type AppTab = 'newSession' | 'collect' | 'profile' | 'learn';

type UseSessionStartFlowOptions = {
  defaultVisitTitle: string;
  sessionUserId: string;
  pendingSessionArtworks: PendingSessionArtwork[];
  newSessionDraftMessage: string;
  isSubmittingPreparedSession: boolean;
  setIsSubmittingPreparedSession: Dispatch<SetStateAction<boolean>>;
  refreshPersistedSessions: () => void;
  setVisitDrafts: Dispatch<SetStateAction<VisitDraft[]>>;
  setItems: Dispatch<SetStateAction<GalleryItem[]>>;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  setFilteredVisitId: Dispatch<SetStateAction<string | null>>;
  setIsComposingNewSession: Dispatch<SetStateAction<boolean>>;
  setVisit: Dispatch<SetStateAction<Visit>>;
  resetPreparedSessionState: () => void;
  appendVisitMessages: (visitId: string, newMessages: VisitStreamMessage[]) => void;
  ingestPreparedUploads: (
    uploadEntries: PreparedSessionUploadEntry[],
    context: PreparedUploadSessionContext,
  ) => Promise<GalleryItem[]>;
  sendVisitInquiryToSession: (
    targetVisitId: string,
    text: string,
    visitItemsOverride?: GalleryItem[],
    options?: { persistUserMessage?: boolean },
  ) => void;
  showToast: ShowToast;
};

export function useSessionStartFlow({
  defaultVisitTitle,
  sessionUserId,
  pendingSessionArtworks,
  newSessionDraftMessage,
  isSubmittingPreparedSession,
  setIsSubmittingPreparedSession,
  refreshPersistedSessions,
  setVisitDrafts,
  setItems,
  setActiveTab,
  setFilteredVisitId,
  setIsComposingNewSession,
  setVisit,
  resetPreparedSessionState,
  appendVisitMessages,
  ingestPreparedUploads,
  sendVisitInquiryToSession,
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

      let sessionId = `visit_${Math.random().toString(36).substring(2, 11)}`;
      let sessionTitle = defaultVisitTitle;
      let hasPersistedInitialCommit = false;

      if (libraryEntries.length > 0) {
        const started = await startSessionWithArtworks(
          sessionUserId,
          {
            session_id: sessionId,
            title: defaultVisitTitle,
            artwork_ids: libraryEntries.map((entry) => entry.artwork.artworkId || entry.artwork.id),
          },
        );
        sessionId = started?.session?.id || sessionId;
        sessionTitle = started?.session?.title || defaultVisitTitle;
        refreshPersistedSessions();
        hasPersistedInitialCommit = true;
      }

      const getSequenceNumber = (entryId: string) => pendingSessionArtworks.findIndex((entry) => entry.id === entryId);

      const resolvedSessionItems: GalleryItem[] = [];
      const libraryStreamMessages: VisitStreamMessage[] = [];
      const now = Date.now();
      let streamCursor = now;
      setItems((prev) => prev.map((item) => {
        const matchingEntry = libraryEntries.find((entry) => entry.artwork.id === item.id);
        if (!matchingEntry) return item;
        const sequenceNumber = getSequenceNumber(matchingEntry.id);
        return updateSessionLinkForItem(item, sessionId, () => ({
          sessionId,
          sessionTitle,
          sequenceNumber,
          source: 'library',
        }));
      }));

      libraryEntries.forEach((entry) => {
        const artworkId = entry.artwork.artworkId || entry.artwork.id;
        libraryStreamMessages.push(
          { id: `capture-${sessionId}-${artworkId}`, role: 'user', text: '', type: 'artwork_capture', artworkId, createdAt: streamCursor++ },
          { id: `card-${sessionId}-${artworkId}`, role: 'model', text: '', type: 'artwork_card', artworkId, createdAt: streamCursor++ },
        );
      });

      if (libraryStreamMessages.length > 0) {
        appendVisitMessages(sessionId, libraryStreamMessages);
      }
      resolvedSessionItems.push(...libraryEntries.map((entry, index) =>
        updateSessionLinkForItem(entry.artwork, sessionId, () => ({
          sessionId,
          sessionTitle,
          sequenceNumber: index,
          source: 'library',
        })),
      ));

      if (uploadEntries.length > 0) {
        const resolvedUploads = await ingestPreparedUploads(uploadEntries, {
          sessionId,
          sessionTitle,
          getSequenceNumber,
        });
        resolvedSessionItems.push(...resolvedUploads);
        if (resolvedUploads.length > 0) {
          hasPersistedInitialCommit = true;
          refreshPersistedSessions();
        }
      }

      if (!hasPersistedInitialCommit || resolvedSessionItems.length === 0) {
        showToast('Couldn’t save the first artwork. Try again.', 'info');
        return;
      }

      setVisitDrafts((prev) => [
        { id: sessionId, title: sessionTitle, createdAt: now, updatedAt: now },
        ...prev.filter((draft) => draft.id !== sessionId),
      ]);
      setActiveTab('newSession');
      setFilteredVisitId(sessionId);
      setIsComposingNewSession(false);
      setVisit({ id: sessionId, itemIds: resolvedSessionItems.map((item) => item.id), globalConversation: [] });
      startTransition(() => {
        resetPreparedSessionState();
      });

      if (newSessionDraftMessage.trim()) {
        window.setTimeout(() => {
          sendVisitInquiryToSession(sessionId, newSessionDraftMessage.trim(), resolvedSessionItems);
        }, 0);
      } else {
        window.setTimeout(() => {
          sendVisitInquiryToSession(
            sessionId,
            buildPreparedSessionFallbackPrompt(pendingSessionArtworks),
            resolvedSessionItems,
            { persistUserMessage: false },
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
    appendVisitMessages,
    defaultVisitTitle,
    ingestPreparedUploads,
    isSubmittingPreparedSession,
    newSessionDraftMessage,
    pendingSessionArtworks,
    refreshPersistedSessions,
    resetPreparedSessionState,
    sendVisitInquiryToSession,
    sessionUserId,
    setActiveTab,
    setFilteredVisitId,
    setIsComposingNewSession,
    setIsSubmittingPreparedSession,
    setItems,
    setVisit,
    setVisitDrafts,
    showToast,
  ]);

  return {
    submitPreparedSession,
  };
}
