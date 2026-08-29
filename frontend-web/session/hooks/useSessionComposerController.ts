import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { useArtworkUploadOperations } from '../../artwork-ingest/hooks/useArtworkUploadOperations';
import type { ArtworkWorkspace, GalleryItem, SessionLink } from '../../types';
import type { useSessionWorkspace } from './useSessionWorkspace';
import { useSessionArtworkInputPipeline } from './useSessionArtworkInputPipeline';

type AppTab = 'newSession' | 'collect' | 'profile' | 'learn';
type SessionWorkspace = ReturnType<typeof useSessionWorkspace>;
type ArtworkUploadOperations = ReturnType<typeof useArtworkUploadOperations>;
type CaptureSubmission = Parameters<ArtworkUploadOperations['prepareCaptureSubmission']>[0];

type UseSessionComposerControllerOptions = {
  userId: string;
  defaultSessionTitle: string;
  items: GalleryItem[];
  canSearchCollection: boolean;
  workspace: SessionWorkspace;
  ingestPreparedUploads: ArtworkUploadOperations['ingestPreparedUploads'];
  prepareCaptureSubmission: ArtworkUploadOperations['prepareCaptureSubmission'];
  handleFileUpload: ArtworkUploadOperations['handleFileUpload'];
  updateArtworkSessionLinks: (
    sessionId: string,
    resolveLink: (item: GalleryItem) => SessionLink | null | undefined,
  ) => void;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  setVisit: Dispatch<SetStateAction<ArtworkWorkspace>>;
  exitCaptureAfterSubmit: () => void;
  showToast: (message: string, type?: 'info' | 'success') => void;
  onAuthenticationRequired: () => void;
};

export function useSessionComposerController({
  userId,
  defaultSessionTitle,
  items,
  canSearchCollection,
  workspace,
  ingestPreparedUploads,
  prepareCaptureSubmission,
  handleFileUpload,
  updateArtworkSessionLinks,
  setActiveTab,
  setVisit,
  exitCaptureAfterSubmit,
  showToast,
  onAuthenticationRequired,
}: UseSessionComposerControllerOptions) {
  const { sessionState, prepared, messaging } = workspace;
  const [libraryPickerSessionId, setLibraryPickerSessionId] = useState<string | null>(null);
  const activeSessionSummary = sessionState.activeSessionSummary;
  const activeSessionIdForStaging = activeSessionSummary?.id ?? null;

  const persistedSessionIds = useMemo(
    () => sessionState.persistedSessions.map((session) => session.id),
    [sessionState.persistedSessions],
  );
  const sessionTitleById = useMemo(
    () => Object.fromEntries(sessionState.sessionSummaries.map((session) => [session.id, session.title])),
    [sessionState.sessionSummaries],
  );

  const pipeline = useSessionArtworkInputPipeline({
    userId,
    defaultSessionTitle,
    items,
    persistedSessionIds,
    sessionTitleById,
    sessionStreams: sessionState.sessionStreams,
    pendingSessionArtworks: prepared.pendingSessionArtworks,
    newSessionDraftMessage: prepared.newSessionDraftMessage,
    isSubmittingPreparedSession: prepared.isSubmittingPreparedSession,
    setIsSubmittingPreparedSession: prepared.setIsSubmittingPreparedSession,
    refreshPersistedSessions: sessionState.refreshPersistedSessions,
    setSessionDrafts: sessionState.setSessionDrafts,
    resetPreparedSessionState: prepared.resetPreparedSessionState,
    updateArtworkSessionLinks,
    setActiveTab,
    setFilteredSessionId: sessionState.setFilteredSessionId,
    setIsComposingNewSession: sessionState.setIsComposingNewSession,
    setSessionStreams: sessionState.setSessionStreams,
    appendSessionEvents: messaging.appendSessionEvents,
    persistSessionArtworkInput: messaging.persistSessionArtworkInput,
    sendSessionInquiryToSession: messaging.sendSessionInquiryToSession,
    ingestPreparedUploads,
    setVisit,
    showToast,
    onAuthenticationRequired,
  });

  const openSessionLibraryPicker = useCallback(() => {
    if (!activeSessionSummary) return;
    if (!canSearchCollection) {
      onAuthenticationRequired();
      return;
    }
    setLibraryPickerSessionId(activeSessionSummary.id);
    prepared.setIsLibraryPickerOpen(true);
  }, [activeSessionSummary, canSearchCollection, onAuthenticationRequired, prepared]);

  const setAuthorizedLibraryPickerOpen: Dispatch<SetStateAction<boolean>> = useCallback((nextOpen) => {
    const resolvedOpen = typeof nextOpen === 'function'
      ? nextOpen(prepared.isLibraryPickerOpen)
      : nextOpen;
    if (resolvedOpen && !canSearchCollection) {
      onAuthenticationRequired();
      return;
    }
    prepared.setIsLibraryPickerOpen(resolvedOpen);
  }, [canSearchCollection, onAuthenticationRequired, prepared]);

  const closeSessionLibraryPicker = useCallback(() => {
    prepared.setIsLibraryPickerOpen(false);
    prepared.setLibraryPickerSearch('');
    setLibraryPickerSessionId(null);
  }, [prepared]);

  const confirmLibrarySelection = useCallback((selectedItems: GalleryItem[]) => {
    prepared.commitLibrarySelection(selectedItems);
    closeSessionLibraryPicker();
  }, [closeSessionLibraryPicker, prepared]);

  useEffect(() => {
    prepared.resetPreparedSessionState();
    // A staged batch belongs to the surface it was composed on. The reset is
    // intentionally keyed only by that surface identity, not callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionIdForStaging]);

  const handleSessionCaptureSubmit = useCallback(async (payload: CaptureSubmission) => {
    const preparedCapture = await prepareCaptureSubmission(payload);
    if (!preparedCapture) return;
    exitCaptureAfterSubmit();
    await pipeline.submitImmediateArtwork(preparedCapture, activeSessionSummary?.id);
  }, [
    activeSessionSummary?.id,
    exitCaptureAfterSubmit,
    pipeline.submitImmediateArtwork,
    prepareCaptureSubmission,
  ]);

  return {
    ...prepared,
    ...pipeline,
    libraryPickerSessionId,
    sessionTitleById,
    setIsLibraryPickerOpen: setAuthorizedLibraryPickerOpen,
    openSessionLibraryPicker,
    closeSessionLibraryPicker,
    confirmLibrarySelection,
    handleSessionCaptureSubmit,
    handleFileUpload,
  };
}
