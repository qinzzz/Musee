import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { deleteSession, type SessionRecord, updateSession } from '../api/sessions';
import type { GalleryItem, Visit } from '../../types';
import type { VisitDraft, VisitStreamMessage, VisitSummary } from '../types';
import { itemBelongsToSession, updateSessionLinkForItem } from '../lib/sessionLinks';

type DeleteConfirmation = { id: string; type: 'item' | 'session' } | null;
type ToastType = 'info' | 'success';
type ShowToast = (message: string, type?: ToastType) => void;

type UseSessionActionsOptions = {
  defaultVisitTitle: string;
  sessionUserId: string;
  visitSummaries: VisitSummary[];
  persistedSessions: SessionRecord[];
  editingVisitTitle: string;
  showToast: ShowToast;
  refreshPersistedSessions: () => void;
  resetPreparedSessionState: () => void;
  isViewingSession: (sessionId: string) => boolean;
  setItems: Dispatch<SetStateAction<GalleryItem[]>>;
  setVisitDrafts: Dispatch<SetStateAction<VisitDraft[]>>;
  setVisitStreams: Dispatch<SetStateAction<Record<string, VisitStreamMessage[]>>>;
  setStreamingVisitResponses: Dispatch<SetStateAction<Record<string, string>>>;
  setVisit: Dispatch<SetStateAction<Visit>>;
  setFilteredVisitId: Dispatch<SetStateAction<string | null>>;
  setPendingDeletedSessionIds: Dispatch<SetStateAction<Set<string>>>;
  setOpenVisitMenuId: Dispatch<SetStateAction<string | null>>;
  setDeleteConfirmation: Dispatch<SetStateAction<DeleteConfirmation>>;
  setEditingVisitId: Dispatch<SetStateAction<string | null>>;
  setEditingVisitTitle: Dispatch<SetStateAction<string>>;
  resetCurrentSessionView: () => void;
};

export function useSessionActions({
  defaultVisitTitle,
  sessionUserId,
  visitSummaries,
  persistedSessions,
  editingVisitTitle,
  showToast,
  refreshPersistedSessions,
  resetPreparedSessionState,
  isViewingSession,
  setItems,
  setVisitDrafts,
  setVisitStreams,
  setStreamingVisitResponses,
  setVisit,
  setFilteredVisitId,
  setPendingDeletedSessionIds,
  setOpenVisitMenuId,
  setDeleteConfirmation,
  setEditingVisitId,
  setEditingVisitTitle,
  resetCurrentSessionView,
}: UseSessionActionsOptions) {
  const handleDeleteSession = useCallback((sessionId: string) => {
    setOpenVisitMenuId(null);
    setDeleteConfirmation({ id: sessionId, type: 'session' });
  }, [setDeleteConfirmation, setOpenVisitMenuId]);

  const handleStartRenameVisit = useCallback((visitId: string, currentTitle: string) => {
    setOpenVisitMenuId(null);
    setEditingVisitId(visitId);
    setEditingVisitTitle(currentTitle);
  }, [setEditingVisitId, setEditingVisitTitle, setOpenVisitMenuId]);

  const saveVisitTitle = useCallback(async (visitId: string, nextTitle: string) => {
    const trimmedTitle = nextTitle.trim() || defaultVisitTitle;
    const currentSummary = visitSummaries.find((summary) => summary.id === visitId);
    const isPersistedSession = persistedSessions.some((session) => session.id === visitId);

    if (!currentSummary || trimmedTitle === currentSummary.title) {
      return;
    }

    if (isPersistedSession) {
      await updateSession(visitId, sessionUserId, trimmedTitle);
      refreshPersistedSessions();
    }

    if (currentSummary.items.length > 0) {
      setItems((prev) => prev.map((item) => (
        itemBelongsToSession(item, visitId)
          ? updateSessionLinkForItem(item, visitId, (existing) => ({
              sessionId: visitId,
              sessionTitle: trimmedTitle,
              sequenceNumber: existing?.sequenceNumber,
              source: existing?.source,
              createdAt: existing?.createdAt,
            }))
          : item
      )));
    }

    setVisitDrafts((prev) => {
      const now = Date.now();
      const existingDraft = prev.find((draft) => draft.id === visitId);
      if (existingDraft) {
        return prev.map((draft) =>
          draft.id === visitId ? { ...draft, title: trimmedTitle, updatedAt: now } : draft,
        );
      }
      return [{ id: visitId, title: trimmedTitle, createdAt: now, updatedAt: now }, ...prev];
    });
  }, [
    defaultVisitTitle,
    persistedSessions,
    refreshPersistedSessions,
    sessionUserId,
    setItems,
    setVisitDrafts,
    visitSummaries,
  ]);

  const commitVisitRename = useCallback(async (visitId: string) => {
    if (!visitSummaries.find((summary) => summary.id === visitId)) {
      setEditingVisitId(null);
      setEditingVisitTitle('');
      return;
    }

    try {
      await saveVisitTitle(visitId, editingVisitTitle);
    } catch (error) {
      console.error('Failed to rename visit:', error);
      showToast('Could not rename session', 'info');
    } finally {
      setEditingVisitId(null);
      setEditingVisitTitle('');
    }
  }, [
    editingVisitTitle,
    saveVisitTitle,
    setEditingVisitId,
    setEditingVisitTitle,
    showToast,
    visitSummaries,
  ]);

  const removeVisitLocally = useCallback((sessionId: string) => {
    setItems((prev) => prev.map((item) => (
      itemBelongsToSession(item, sessionId)
        ? updateSessionLinkForItem(item, sessionId, () => null)
        : item
    )));
    setVisitDrafts((prev) => prev.filter((draft) => draft.id !== sessionId));
    setVisitStreams((prev) => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    setStreamingVisitResponses((prev) => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    setVisit((prev) => (
      prev.id === sessionId ? { ...prev, id: '', itemIds: [], globalConversation: [] } : prev
    ));
    setFilteredVisitId((prev) => (prev === sessionId ? null : prev));
    setPendingDeletedSessionIds((prev) => {
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
  }, [
    setFilteredVisitId,
    setItems,
    setPendingDeletedSessionIds,
    setStreamingVisitResponses,
    setVisit,
    setVisitDrafts,
    setVisitStreams,
  ]);

  const confirmDeleteSession = useCallback(async (sessionId: string) => {
    const isCurrentlyViewedSession = isViewingSession(sessionId);

    setDeleteConfirmation(null);
    setOpenVisitMenuId(null);
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
      removeVisitLocally(sessionId);
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
    removeVisitLocally,
    resetCurrentSessionView,
    resetPreparedSessionState,
    sessionUserId,
    setDeleteConfirmation,
    setOpenVisitMenuId,
    setPendingDeletedSessionIds,
    showToast,
  ]);

  return {
    handleDeleteSession,
    handleStartRenameVisit,
    saveVisitTitle,
    commitVisitRename,
    confirmDeleteSession,
  };
}
