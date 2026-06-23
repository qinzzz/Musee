import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { fetchSessionMessages } from '../api/sessions';
import { usePreparedSessionStaging } from './usePreparedSessionStaging';
import { useSessionActions } from './useSessionActions';
import { useSessionMessaging } from './useSessionMessaging';
import { useSessionStartFlow } from './useSessionStartFlow';
import { useVisits } from './useVisits';
import type { GalleryItem, Visit } from '../../types';
import type { InterpretingItem } from '../../artwork/types';
import type { PreparedSessionUploadEntry, PreparedUploadSessionContext } from '../../artwork-ingest/types';
import type {
  PendingSessionArtwork,
  VisitDraft,
  VisitStreamMessage,
} from '../types';

type DeleteConfirmation = { id: string; type: 'item' | 'session' } | null;
type AppTab = 'newSession' | 'collect' | 'profile' | 'learn';
type ToastType = 'info' | 'success';
type ShowToast = (message: string, type?: ToastType) => void;

type UseSessionWorkspaceOptions = {
  userId: string;
  items: GalleryItem[];
  artworksLoaded: boolean;
  deleteConfirmation: DeleteConfirmation;
  defaultVisitTitle: string;
  initialIsComposingNewSession: boolean;
  activeTab: AppTab;
  interpretingItem: InterpretingItem | null;
  renameInputRef: RefObject<HTMLInputElement | null>;
  visitStreamScrollRef: RefObject<HTMLDivElement | null>;
  visitStreamEndRef: RefObject<HTMLDivElement | null>;
  setItems: Dispatch<SetStateAction<GalleryItem[]>>;
  setVisit: Dispatch<SetStateAction<Visit>>;
  setInterpretingItem: Dispatch<SetStateAction<InterpretingItem | null>>;
  setDeleteConfirmation: Dispatch<SetStateAction<DeleteConfirmation>>;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  clearShellOverlays: () => void;
  showToast: ShowToast;
  ingestPreparedUploads: (
    uploadEntries: PreparedSessionUploadEntry[],
    context: PreparedUploadSessionContext,
  ) => Promise<GalleryItem[]>;
};

export function useSessionWorkspace({
  userId,
  items,
  artworksLoaded,
  deleteConfirmation,
  defaultVisitTitle,
  initialIsComposingNewSession,
  activeTab,
  interpretingItem,
  renameInputRef,
  visitStreamScrollRef,
  visitStreamEndRef,
  setItems,
  setVisit,
  setInterpretingItem,
  setDeleteConfirmation,
  setActiveTab,
  clearShellOverlays,
  showToast,
  ingestPreparedUploads,
}: UseSessionWorkspaceOptions) {
  const [pendingDeletedSessionIds, setPendingDeletedSessionIds] = useState<Set<string>>(new Set());
  const resetPreparedSessionStateRef = useRef<() => void>(() => {});

  const visits = useVisits({
    userId,
    items,
    artworksLoaded,
    deleteConfirmation,
    defaultVisitTitle,
    initialIsComposingNewSession,
    visitDraftsStorageKey: 'musee_visit_drafts',
    visitStreamsStorageKey: 'musee_visit_streams',
    sessionGoalsStorageKey: 'musee_session_goals',
  });

  const prepared = usePreparedSessionStaging({
    items,
    showToast,
  });

  resetPreparedSessionStateRef.current = prepared.resetPreparedSessionState;

  const messaging = useSessionMessaging({
    defaultVisitTitle,
    sessionUserId: userId,
    filteredVisitId: visits.filteredVisitId,
    isComposingNewSession: visits.isComposingNewSession,
    items,
    visitStreams: visits.visitStreams,
    sessionGoals: visits.sessionGoals,
    visitSummaries: visits.visitSummaries,
    activeVisitSummary: visits.activeVisitSummary,
    refreshPersistedSessions: visits.refreshPersistedSessions,
    setVisitDrafts: visits.setVisitDrafts,
    setFilteredVisitId: visits.setFilteredVisitId,
    setIsComposingNewSession: visits.setIsComposingNewSession,
    setVisit,
    setVisitStreams: visits.setVisitStreams,
    setStreamingVisitResponses: visits.setStreamingVisitResponses,
    showToast,
  });

  const enterBlankSession = useCallback(() => {
    setActiveTab('newSession');
    visits.setFilteredVisitId(null);
    visits.setIsComposingNewSession(true);
    prepared.resetPreparedSessionState();
    setVisit({
      id: '',
      itemIds: [],
      globalConversation: [],
    });
  }, [
    prepared,
    setActiveTab,
    setVisit,
    visits,
  ]);

  const openSessionSummary = useCallback((summaryId: string) => {
    setActiveTab('newSession');
    visits.setFilteredVisitId(summaryId);
    visits.setIsComposingNewSession(false);
    prepared.resetPreparedSessionState();
  }, [
    prepared,
    setActiveTab,
    visits,
  ]);

  useEffect(() => {
    if (activeTab !== 'newSession' || interpretingItem || !visitStreamEndRef.current || !visits.activeVisitSummary) return;

    requestAnimationFrame(() => {
      visitStreamEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }, [
    activeTab,
    interpretingItem,
    visitStreamEndRef,
    visits.activeVisitSummary?.id,
    visits.activeVisitStream.length,
    visits.activeVisitSummary ? visits.streamingVisitResponses[visits.activeVisitSummary.id] : '',
  ]);

  useEffect(() => {
    if (visitStreamScrollRef.current) visitStreamScrollRef.current.scrollTop = 0;
    if (!visits.activeVisitSummary?.id) return;
    const sessionId = visits.activeVisitSummary.id;
    fetchSessionMessages(sessionId).then(dbMessages => {
      if (!dbMessages.length) return;
      visits.setVisitStreams(prev => {
        const existing = prev[sessionId] || [];
        const existingIds = new Set(existing.map(m => m.id));
        const newMsgs: VisitStreamMessage[] = dbMessages
          .filter(m => !existingIds.has(m.id || ''))
          .map(m => ({
            id: m.id || `db-${Date.now()}-${Math.random()}`,
            role: m.role as 'user' | 'model',
            text: m.content || '',
            type: (m.type || 'text') as VisitStreamMessage['type'],
            artworkId: m.artwork_id || undefined,
            createdAt: m.created_at ? new Date(m.created_at as unknown as string).getTime() : Date.now(),
          }));
        if (!newMsgs.length) return prev;
        return { ...prev, [sessionId]: [...existing, ...newMsgs].sort((a, b) => a.createdAt - b.createdAt) };
      });
    }).catch(() => {});
  }, [visitStreamScrollRef, visits.activeVisitSummary?.id, visits.setVisitStreams]);

  useEffect(() => {
    if (!visits.editingVisitId || !renameInputRef.current) return;
    renameInputRef.current.focus();
    renameInputRef.current.select();
  }, [renameInputRef, visits.editingVisitId]);

  const sessionActions = useSessionActions({
    defaultVisitTitle,
    sessionUserId: userId,
    visitSummaries: visits.visitSummaries,
    persistedSessions: visits.persistedSessions,
    editingVisitTitle: visits.editingVisitTitle,
    interpretingItem,
    showToast,
    refreshPersistedSessions: visits.refreshPersistedSessions,
    resetPreparedSessionState: prepared.resetPreparedSessionState,
    isViewingSession: (sessionId) => activeTab === 'newSession' && visits.activeVisitSummary?.id === sessionId,
    setItems,
    setVisitDrafts: visits.setVisitDrafts,
    setVisitStreams: visits.setVisitStreams,
    setStreamingVisitResponses: visits.setStreamingVisitResponses,
    setVisit,
    setInterpretingItem,
    setFilteredVisitId: visits.setFilteredVisitId,
    setPendingDeletedSessionIds,
    setOpenVisitMenuId: visits.setOpenVisitMenuId,
    setDeleteConfirmation,
    setEditingVisitId: visits.setEditingVisitId,
    setEditingVisitTitle: visits.setEditingVisitTitle,
    resetCurrentSessionView: () => {
      setActiveTab('newSession');
      visits.setFilteredVisitId(null);
      visits.setIsComposingNewSession(true);
      setVisit({
        id: '',
        itemIds: [],
        globalConversation: [],
      });
      clearShellOverlays();
      resetPreparedSessionStateRef.current();
    },
  });

  const submitPreparedSessionFlow = useSessionStartFlow({
    defaultVisitTitle,
    sessionUserId: userId,
    pendingSessionArtworks: prepared.pendingSessionArtworks,
    newSessionDraftMessage: prepared.newSessionDraftMessage,
    isSubmittingPreparedSession: prepared.isSubmittingPreparedSession,
    setIsSubmittingPreparedSession: prepared.setIsSubmittingPreparedSession,
    refreshPersistedSessions: visits.refreshPersistedSessions,
    setVisitDrafts: visits.setVisitDrafts,
    setItems,
    setActiveTab,
    setFilteredVisitId: visits.setFilteredVisitId,
    setIsComposingNewSession: visits.setIsComposingNewSession,
    setVisit,
    resetPreparedSessionState: prepared.resetPreparedSessionState,
    appendVisitMessages: messaging.appendVisitMessages,
    ingestPreparedUploads,
    sendVisitInquiryToSession: messaging.sendVisitInquiryToSession,
    showToast,
  });

  const recentVisitSummaries = useMemo(() => visits.visitSummaries.slice(0, 10), [visits.visitSummaries]);
  const sessionsLoading = !artworksLoaded && visits.visitSummaries.length === 0;

  return {
    userId,
    visits,
    prepared,
    messaging,
    sessionActions,
    submitPreparedSession: submitPreparedSessionFlow.submitPreparedSession,
    pendingDeletedSessionIds,
    recentVisitSummaries,
    sessionsLoading,
    enterBlankSession,
    openSessionSummary,
  };
}
