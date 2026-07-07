import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { getPrimarySessionEventArtworkId, getSessionEventArtworkIds } from '../lib/sessionEventArtworks';
import { parseServerTimestamp } from '../../lib/time';
import { compareSessionEvents } from '../lib/sessionOrdering';
import { usePreparedSessionStaging } from './usePreparedSessionStaging';
import { useSessionActions } from './useSessionActions';
import { useSessionMessaging } from './useSessionMessaging';
import { useSessionEventsQuery } from './useSessionEventsQuery';
import { useSessionStartFlow } from './useSessionStartFlow';
import { useSessionState } from './useSessionState';
import type { ArtworkWorkspace, GalleryItem, SessionLink } from '../../types';
import type { ArtworkDetailItem } from '../../artwork/types';
import type {
  PreparedSessionUploadEntry,
  PreparedUploadIngestResult,
  PreparedUploadSessionContext,
} from '../../artwork-ingest/types';
import type {
  PendingSessionArtwork,
  SessionStreamMessage,
} from '../types';

import type { DeleteConfirmationState } from '../../app-shell/components/AppConfirmationLayer';

type DeleteConfirmation = DeleteConfirmationState;
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
  artworkDetailItem: ArtworkDetailItem | null;
  renameInputRef: RefObject<HTMLInputElement | null>;
  sessionStreamScrollRef: RefObject<HTMLDivElement | null>;
  sessionStreamEndRef: RefObject<HTMLDivElement | null>;
  updateArtworkSessionLinks: (sessionId: string, resolveLink: (item: GalleryItem) => SessionLink | null | undefined) => void;
  setVisit: Dispatch<SetStateAction<ArtworkWorkspace>>;
  setDeleteConfirmation: Dispatch<SetStateAction<DeleteConfirmation>>;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  clearShellOverlays: () => void;
  showToast: ShowToast;
  ingestPreparedUploads: (
    uploadEntries: PreparedSessionUploadEntry[],
    context: PreparedUploadSessionContext,
  ) => Promise<PreparedUploadIngestResult>;
};

export function useSessionWorkspace({
  userId,
  items,
  artworksLoaded,
  deleteConfirmation,
  defaultSessionTitle,
  initialIsComposingNewSession,
  activeTab,
  artworkDetailItem,
  renameInputRef,
  sessionStreamScrollRef,
  sessionStreamEndRef,
  updateArtworkSessionLinks,
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
    persistedSessionsStorageKey: 'musee_persisted_sessions',
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
    streamingSessionResponses: sessionState.streamingSessionResponses,
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
    if (activeTab !== 'newSession' || artworkDetailItem || !sessionStreamEndRef.current || !sessionState.activeSessionSummary) return;

    requestAnimationFrame(() => {
      sessionStreamEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }, [
    activeTab,
    artworkDetailItem,
    sessionStreamEndRef,
    sessionState.activeSessionSummary?.id,
    sessionState.activeSessionStream.length,
    sessionState.activeSessionSummary ? sessionState.streamingSessionResponses[sessionState.activeSessionSummary.id] : '',
  ]);

  const activeSessionId = sessionState.activeSessionSummary?.id || null;

  // Canonical events come from the shared query layer; cached data repaints a
  // re-opened session immediately while the refetch confirms it.
  const { events: canonicalSessionEvents } = useSessionEventsQuery({
    sessionId: activeSessionId,
    enabled: activeTab === 'newSession',
  });

  useEffect(() => {
    if (activeTab !== 'newSession') return;
    if (sessionStreamScrollRef.current) sessionStreamScrollRef.current.scrollTop = 0;
  }, [activeTab, activeSessionId, sessionStreamScrollRef]);

  useEffect(() => {
    if (!activeSessionId) return;
    const sessionId = activeSessionId;
    const dbMessages = canonicalSessionEvents;
    if (!dbMessages?.length) return;
    if (dbMessages.some((message) => (
      (message.event_type === 'artwork_commentary' || message.type === 'artwork_commentary')
      && (message.payload as Record<string, unknown> | undefined)?.status !== 'pending'
    ))) {
      sessionState.setStreamingSessionResponses((prev) => {
        if (!(sessionId in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
    }
    sessionState.setSessionStreams(prev => {
      const existing = prev[sessionId] || [];
      const normalizedDbMessages: SessionStreamMessage[] = dbMessages.map(m => {
        const artworkIds = getSessionEventArtworkIds(m);
        const canonicalEventType = m.event_type || m.type;
        const frontendMessageType: SessionStreamMessage['type'] =
          canonicalEventType === 'artwork_commentary'
            ? 'artwork_commentary'
            : canonicalEventType === 'user_input'
              ? 'text'
              : (m.type || 'text') as SessionStreamMessage['type'];
        return {
          id: m.id || `db-${Date.now()}-${Math.random()}`,
          role: m.role as 'user' | 'model',
          text: m.content || '',
          type: frontendMessageType,
          artworkId: getPrimarySessionEventArtworkId(m),
          artworkIds: artworkIds.length ? artworkIds : undefined,
          payload: m.payload as Record<string, unknown> | undefined,
          triggerEventId: m.trigger_event_id || (canonicalEventType === 'user_input' ? m.id : undefined) || m.turn_id || undefined,
          sequenceNumber: typeof m.sequence_number === 'number' ? m.sequence_number : undefined,
          createdAt: parseServerTimestamp(m.created_at as unknown as string),
        };
      });
      const dbMessageIds = new Set(normalizedDbMessages.map((message) => message.id));
      // Reconciliation: the backend is canonical for confirmed history — the
      // fetch replaces it wholesale (id match wins). Only the optimistic
      // overlay survives: local events with no sequenceNumber yet whose POST
      // hasn't been confirmed by this fetch (in-flight user messages, pending
      // commentary, local-only capture/card markers). They keep rendering via
      // localOrder until a later fetch returns them with a real sequence.
      const pendingLocalOnlyMessages = existing.filter((message) => (
        !dbMessageIds.has(message.id)
        && typeof message.sequenceNumber !== 'number'
      ));
      const nextMessages = [...normalizedDbMessages, ...pendingLocalOnlyMessages].sort(compareSessionEvents);
      if (
        nextMessages.length === existing.length
        && nextMessages.every((message, index) => {
          const previous = existing[index];
          return previous
            && previous.id === message.id
            && previous.createdAt === message.createdAt
            && previous.sequenceNumber === message.sequenceNumber
            && previous.triggerEventId === message.triggerEventId
            && previous.text === message.text
            && previous.type === message.type;
        })
      ) {
        return prev;
      }
      return { ...prev, [sessionId]: nextMessages };
    });
  }, [activeSessionId, canonicalSessionEvents, sessionState.setSessionStreams, sessionState.setStreamingSessionResponses]);

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
    renamePersistedSession: sessionState.renamePersistedSession,
    resetPreparedSessionState: prepared.resetPreparedSessionState,
    isViewingSession: (sessionId) => activeTab === 'newSession' && sessionState.activeSessionSummary?.id === sessionId,
    updateArtworkSessionLinks,
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
    updateArtworkSessionLinks,
    setActiveTab,
    setFilteredSessionId: sessionState.setFilteredSessionId,
    setIsComposingNewSession: sessionState.setIsComposingNewSession,
    setVisit,
    resetPreparedSessionState: prepared.resetPreparedSessionState,
    appendSessionEvents: messaging.appendSessionEvents,
    persistSessionArtworkInput: messaging.persistSessionArtworkInput,
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
