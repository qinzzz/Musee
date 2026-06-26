import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { deleteSession, type SessionRecord, updateSession } from '../api/sessions';
import type { GalleryItem, Visit } from '../../types';
import type { SessionDraft, SessionStreamMessage, SessionSummary } from '../types';
import { itemBelongsToSession, updateSessionLinkForItem } from '../lib/sessionLinks';

type DeleteConfirmation = { id: string; type: 'item' | 'session' } | null;
type ToastType = 'info' | 'success';
type ShowToast = (message: string, type?: ToastType) => void;

type UseSessionActionsOptions = {
  defaultSessionTitle: string;
  sessionUserId: string;
  sessionSummaries: SessionSummary[];
  persistedSessions: SessionRecord[];
  editingSessionTitle: string;
  showToast: ShowToast;
  refreshPersistedSessions: () => void;
  resetPreparedSessionState: () => void;
  isViewingSession: (sessionId: string) => boolean;
  setItems: Dispatch<SetStateAction<GalleryItem[]>>;
  setSessionDrafts: Dispatch<SetStateAction<SessionDraft[]>>;
  setSessionStreams: Dispatch<SetStateAction<Record<string, SessionStreamMessage[]>>>;
  setStreamingSessionResponses: Dispatch<SetStateAction<Record<string, string>>>;
  setVisit: Dispatch<SetStateAction<Visit>>;
  setFilteredSessionId: Dispatch<SetStateAction<string | null>>;
  setPendingDeletedSessionIds: Dispatch<SetStateAction<Set<string>>>;
  setOpenSessionMenuId: Dispatch<SetStateAction<string | null>>;
  setDeleteConfirmation: Dispatch<SetStateAction<DeleteConfirmation>>;
  setEditingSessionId: Dispatch<SetStateAction<string | null>>;
  setEditingSessionTitle: Dispatch<SetStateAction<string>>;
  resetCurrentSessionView: () => void;
};

export function useSessionActions({
  defaultSessionTitle,
  sessionUserId,
  sessionSummaries,
  persistedSessions,
  editingSessionTitle,
  showToast,
  refreshPersistedSessions,
  resetPreparedSessionState,
  isViewingSession,
  setItems,
  setSessionDrafts,
  setSessionStreams,
  setStreamingSessionResponses,
  setVisit,
  setFilteredSessionId,
  setPendingDeletedSessionIds,
  setOpenSessionMenuId,
  setDeleteConfirmation,
  setEditingSessionId,
  setEditingSessionTitle,
  resetCurrentSessionView,
}: UseSessionActionsOptions) {
  const handleDeleteSession = useCallback((sessionId: string) => {
    setOpenSessionMenuId(null);
    setDeleteConfirmation({ id: sessionId, type: 'session' });
  }, [setDeleteConfirmation, setOpenSessionMenuId]);

  const handleStartRenameSession = useCallback((sessionId: string, currentTitle: string) => {
    setOpenSessionMenuId(null);
    setEditingSessionId(sessionId);
    setEditingSessionTitle(currentTitle);
  }, [setEditingSessionId, setEditingSessionTitle, setOpenSessionMenuId]);

  const saveSessionTitle = useCallback(async (sessionId: string, nextTitle: string) => {
    const trimmedTitle = nextTitle.trim() || defaultSessionTitle;
    const currentSummary = sessionSummaries.find((summary) => summary.id === sessionId);
    const isPersistedSession = persistedSessions.some((session) => session.id === sessionId);

    if (!currentSummary || trimmedTitle === currentSummary.title) {
      return;
    }

    if (isPersistedSession) {
      await updateSession(sessionId, sessionUserId, trimmedTitle);
      refreshPersistedSessions();
    }

    setSessionDrafts((prev) => {
      const now = Date.now();
      const existingDraft = prev.find((draft) => draft.id === sessionId);
      if (existingDraft) {
        return prev.map((draft) =>
          draft.id === sessionId ? { ...draft, title: trimmedTitle, updatedAt: now } : draft,
        );
      }
      return [{ id: sessionId, title: trimmedTitle, createdAt: now, updatedAt: now }, ...prev];
    });
  }, [
    defaultSessionTitle,
    persistedSessions,
    refreshPersistedSessions,
    sessionUserId,
    setSessionDrafts,
    sessionSummaries,
  ]);

  const commitSessionRename = useCallback(async (sessionId: string) => {
    if (!sessionSummaries.find((summary) => summary.id === sessionId)) {
      setEditingSessionId(null);
      setEditingSessionTitle('');
      return;
    }

    try {
      await saveSessionTitle(sessionId, editingSessionTitle);
    } catch (error) {
      console.error('Failed to rename session:', error);
      showToast('Could not rename session', 'info');
    } finally {
      setEditingSessionId(null);
      setEditingSessionTitle('');
    }
  }, [
    editingSessionTitle,
    saveSessionTitle,
    setEditingSessionId,
    setEditingSessionTitle,
    showToast,
    sessionSummaries,
  ]);

  const removeSessionLocally = useCallback((sessionId: string) => {
    setItems((prev) => prev.map((item) => (
      itemBelongsToSession(item, sessionId)
        ? updateSessionLinkForItem(item, sessionId, () => null)
        : item
    )));
    setSessionDrafts((prev) => prev.filter((draft) => draft.id !== sessionId));
    setSessionStreams((prev) => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    setStreamingSessionResponses((prev) => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    setVisit((prev) => (
      prev.id === sessionId ? { ...prev, id: '', itemIds: [], globalConversation: [] } : prev
    ));
    setFilteredSessionId((prev) => (prev === sessionId ? null : prev));
    setPendingDeletedSessionIds((prev) => {
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
  }, [
    setFilteredSessionId,
    setItems,
    setPendingDeletedSessionIds,
    setStreamingSessionResponses,
    setVisit,
    setSessionDrafts,
    setSessionStreams,
  ]);

  const confirmDeleteSession = useCallback(async (sessionId: string) => {
    const isCurrentlyViewedSession = isViewingSession(sessionId);

    setDeleteConfirmation(null);
    setOpenSessionMenuId(null);
    setPendingDeletedSessionIds((prev) => {
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });

    if (isCurrentlyViewedSession) {
      resetPreparedSessionState();
      resetCurrentSessionView();
    }

    try {
      try {
        await deleteSession(sessionId, sessionUserId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('404')) {
          throw error;
        }
      }
      removeSessionLocally(sessionId);
      refreshPersistedSessions();
      showToast('Session deleted. Artworks stayed in your library.', 'success');
      console.log(`Successfully deleted session: ${sessionId}`);
    } catch (error) {
      console.error('Failed to delete session:', error);
      setPendingDeletedSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
      showToast('Could not delete session', 'info');
    }
  }, [
    isViewingSession,
    refreshPersistedSessions,
    removeSessionLocally,
    resetCurrentSessionView,
    resetPreparedSessionState,
    sessionUserId,
    setDeleteConfirmation,
    setOpenSessionMenuId,
    setPendingDeletedSessionIds,
    showToast,
  ]);

  return {
    handleDeleteSession,
    handleStartRenameSession,
    saveSessionTitle,
    commitSessionRename,
    confirmDeleteSession,
  };
}
