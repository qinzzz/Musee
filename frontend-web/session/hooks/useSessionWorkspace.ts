import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { fetchSessionMessages } from '../api/sessions';
import { usePreparedSessionStaging } from './usePreparedSessionStaging';
import { useSessionActions } from './useSessionActions';
import { useSessionMessaging } from './useSessionMessaging';
import { useSessionStartFlow } from './useSessionStartFlow';
import { useSessionState } from './useSessionState';
import type { GalleryItem, Visit } from '../../types';
import type { InterpretingItem } from '../../artwork/types';
import type { PreparedSessionUploadEntry, PreparedUploadSessionContext } from '../../artwork-ingest/types';
import type {
  PendingSessionArtwork,
  SessionStreamMessage,
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
  defaultSessionTitle: string;
  initialIsComposingNewSession: boolean;
  activeTab: AppTab;
  interpretingItem: InterpretingItem | null;
  renameInputRef: RefObject<HTMLInputElement | null>;
  sessionStreamScrollRef: RefObject<HTMLDivElement | null>;
  sessionStreamEndRef: RefObject<HTMLDivElement | null>;
  setItems: Dispatch<SetStateAction<GalleryItem[]>>;
  setVisit: Dispatch<SetStateAction<Visit>>;
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
  defaultSessionTitle,
  initialIsComposingNewSession,
  activeTab,
  interpretingItem,
  renameInputRef,
  sessionStreamScrollRef,
  sessionStreamEndRef,
  setItems,
  setVisit,
  setDeleteConfirmation,
  setActiveTab,
  clearShellOverlays,
  showToast,
  ingestPreparedUploads,
}: UseSessionWorkspaceOptions) {
  const [pendingDeletedSessionIds, setPendingDeletedSessionIds] = useState<Set<string>>(new Set());
  const resetPreparedSessionStateRef = useRef<() => void>(() => {});

  const sessionState = useSessionState({
    userId,
    items,
    artworksLoaded,
    deleteConfirmation,
    defaultSessionTitle,
    initialIsComposingNewSession,
    sessionDraftsStorageKey: 'musee_session_drafts',
    sessionStreamsStorageKey: 'musee_session_streams',
    sessionGoalsStorageKey: 'musee_session_goals',
  });

  const prepared = usePreparedSessionStaging({
    items,
    showToast,
  });

  resetPreparedSessionStateRef.current = prepared.resetPreparedSessionState;

  const messaging = useSessionMessaging({
    defaultSessionTitle,
    sessionUserId: userId,
    filteredSessionId: sessionState.filteredSessionId,
    isComposingNewSession: sessionState.isComposingNewSession,
    items,
    sessionStreams: sessionState.sessionStreams,
    sessionGoals: sessionState.sessionGoals,
    sessionSummaries: sessionState.sessionSummaries,
    activeSessionSummary: sessionState.activeSessionSummary,
    refreshPersistedSessions: sessionState.refreshPersistedSessions,
    setSessionDrafts: sessionState.setSessionDrafts,
    setFilteredSessionId: sessionState.setFilteredSessionId,
    setIsComposingNewSession: sessionState.setIsComposingNewSession,
    setVisit,
    setSessionStreams: sessionState.setSessionStreams,
    setStreamingSessionResponses: sessionState.setStreamingSessionResponses,
    showToast,
  });

  const enterBlankSession = useCallback(() => {
    setActiveTab('newSession');
    sessionState.setFilteredSessionId(null);
    sessionState.setIsComposingNewSession(true);
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
    sessionState,
  ]);

  const openSessionSummary = useCallback((summaryId: string) => {
    setActiveTab('newSession');
    sessionState.setFilteredSessionId(summaryId);
    sessionState.setIsComposingNewSession(false);
    prepared.resetPreparedSessionState();
  }, [
    prepared,
    setActiveTab,
    sessionState,
  ]);

  useEffect(() => {
    if (activeTab !== 'newSession' || interpretingItem || !sessionStreamEndRef.current || !sessionState.activeSessionSummary) return;

    requestAnimationFrame(() => {
      sessionStreamEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }, [
    activeTab,
    interpretingItem,
    sessionStreamEndRef,
    sessionState.activeSessionSummary?.id,
    sessionState.activeSessionStream.length,
    sessionState.activeSessionSummary ? sessionState.streamingSessionResponses[sessionState.activeSessionSummary.id] : '',
  ]);

  useEffect(() => {
    if (activeTab !== 'newSession') return;
    if (sessionStreamScrollRef.current) sessionStreamScrollRef.current.scrollTop = 0;
    if (!sessionState.activeSessionSummary?.id) return;
    const sessionId = sessionState.activeSessionSummary.id;
    fetchSessionMessages(sessionId).then(dbMessages => {
      if (!dbMessages.length) return;
      sessionState.setSessionStreams(prev => {
        const existing = prev[sessionId] || [];
        const existingIds = new Set(existing.map(m => m.id));
        const newMsgs: SessionStreamMessage[] = dbMessages
          .filter(m => !existingIds.has(m.id || ''))
          .map(m => ({
            id: m.id || `db-${Date.now()}-${Math.random()}`,
            role: m.role as 'user' | 'model',
            text: m.content || '',
            type: (m.type || 'text') as SessionStreamMessage['type'],
            artworkId: m.artwork_id || undefined,
            createdAt: m.created_at ? new Date(m.created_at as unknown as string).getTime() : Date.now(),
          }));
        if (!newMsgs.length) return prev;
        return { ...prev, [sessionId]: [...existing, ...newMsgs].sort((a, b) => a.createdAt - b.createdAt) };
      });
    }).catch(() => {});
  }, [activeTab, sessionStreamScrollRef, sessionState.activeSessionSummary?.id, sessionState.setSessionStreams]);

  useEffect(() => {
    if (!sessionState.editingSessionId || !renameInputRef.current) return;
    renameInputRef.current.focus();
    renameInputRef.current.select();
  }, [renameInputRef, sessionState.editingSessionId]);

  const sessionActions = useSessionActions({
    defaultSessionTitle,
    sessionUserId: userId,
    sessionSummaries: sessionState.sessionSummaries,
    persistedSessions: sessionState.persistedSessions,
    editingSessionTitle: sessionState.editingSessionTitle,
    showToast,
    refreshPersistedSessions: sessionState.refreshPersistedSessions,
    resetPreparedSessionState: prepared.resetPreparedSessionState,
    isViewingSession: (sessionId) => activeTab === 'newSession' && sessionState.activeSessionSummary?.id === sessionId,
    setItems,
    setSessionDrafts: sessionState.setSessionDrafts,
    setSessionStreams: sessionState.setSessionStreams,
    setStreamingSessionResponses: sessionState.setStreamingSessionResponses,
    setVisit,
    setFilteredSessionId: sessionState.setFilteredSessionId,
    setPendingDeletedSessionIds,
    setOpenSessionMenuId: sessionState.setOpenSessionMenuId,
    setDeleteConfirmation,
    setEditingSessionId: sessionState.setEditingSessionId,
    setEditingSessionTitle: sessionState.setEditingSessionTitle,
    resetCurrentSessionView: () => {
      setActiveTab('newSession');
      sessionState.setFilteredSessionId(null);
      sessionState.setIsComposingNewSession(true);
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
    defaultSessionTitle,
    sessionUserId: userId,
    pendingSessionArtworks: prepared.pendingSessionArtworks,
    newSessionDraftMessage: prepared.newSessionDraftMessage,
    isSubmittingPreparedSession: prepared.isSubmittingPreparedSession,
    setIsSubmittingPreparedSession: prepared.setIsSubmittingPreparedSession,
    refreshPersistedSessions: sessionState.refreshPersistedSessions,
    setSessionDrafts: sessionState.setSessionDrafts,
    setItems,
    setActiveTab,
    setFilteredSessionId: sessionState.setFilteredSessionId,
    setIsComposingNewSession: sessionState.setIsComposingNewSession,
    setVisit,
    resetPreparedSessionState: prepared.resetPreparedSessionState,
    appendSessionMessages: messaging.appendSessionMessages,
    ingestPreparedUploads,
    sendSessionInquiryToSession: messaging.sendSessionInquiryToSession,
    showToast,
  });

  const recentSessionSummaries = useMemo(() => sessionState.sessionSummaries.slice(0, 10), [sessionState.sessionSummaries]);
  const sessionsLoading = !artworksLoaded && sessionState.sessionSummaries.length === 0;

  return {
    userId,
    sessionState,
    prepared,
    messaging,
    sessionActions,
    submitPreparedSession: submitPreparedSessionFlow.submitPreparedSession,
    pendingDeletedSessionIds,
    recentSessionSummaries,
    sessionsLoading,
    enterBlankSession,
    openSessionSummary,
  };
}
