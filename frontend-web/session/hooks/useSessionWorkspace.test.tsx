import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionWorkspace } from './useSessionWorkspace';
import type { ArtworkWorkspace, GalleryItem } from '../../types';
import type { ArtworkDetailItem } from '../../artwork/types';
import type {
  PreparedSessionUploadEntry,
  PreparedUploadIngestResult,
  PreparedUploadSessionContext,
} from '../../artwork-ingest/types';
import type { SessionStreamMessage } from '../types';

const {
  mockFetchSessionMessages,
  mockUsePreparedSessionStaging,
  mockUseSessionActions,
  mockUseSessionMessaging,
  mockUseSessionStartFlow,
  mockUseSessionState,
} = vi.hoisted(() => ({
  mockFetchSessionMessages: vi.fn(),
  mockUsePreparedSessionStaging: vi.fn(),
  mockUseSessionActions: vi.fn(),
  mockUseSessionMessaging: vi.fn(),
  mockUseSessionStartFlow: vi.fn(),
  mockUseSessionState: vi.fn(),
}));

vi.mock('../api/sessions', () => ({
  fetchSessionEvents: mockFetchSessionMessages,
}));

vi.mock('./usePreparedSessionStaging', () => ({
  usePreparedSessionStaging: mockUsePreparedSessionStaging,
}));

vi.mock('./useSessionActions', () => ({
  useSessionActions: mockUseSessionActions,
}));

vi.mock('./useSessionMessaging', () => ({
  useSessionMessaging: mockUseSessionMessaging,
}));

vi.mock('./useSessionStartFlow', () => ({
  useSessionStartFlow: mockUseSessionStartFlow,
}));

vi.mock('./useSessionState', () => ({
  useSessionState: mockUseSessionState,
}));

function createSessionMessage(overrides: Partial<SessionStreamMessage> = {}): SessionStreamMessage {
  return {
    id: 'msg-1',
    role: 'model',
    text: 'hello',
    createdAt: 100,
    ...overrides,
  };
}

function createSessionStateMock(overrides: Record<string, unknown> = {}) {
  return {
    filteredSessionId: 'session-1',
    setFilteredSessionId: vi.fn(),
    isComposingNewSession: false,
    setIsComposingNewSession: vi.fn(),
    activeSessionSummary: {
      id: 'session-1',
      title: 'Session 1',
      location: null,
      artworkCount: 0,
      updatedAt: Date.now(),
      dateLabel: null,
      items: [],
    },
    activeSessionStream: [createSessionMessage()],
    activeSessionRenderBlocks: [],
    streamingSessionResponses: { 'session-1': 'streaming' },
    setSessionStreams: vi.fn(),
    sessionStreams: {
      'session-1': [createSessionMessage({ id: 'existing', createdAt: 200 })],
    },
    sessionSummaries: [
      {
        id: 'session-1',
        title: 'Session 1',
        location: null,
        artworkCount: 0,
        updatedAt: Date.now(),
        dateLabel: null,
        items: [],
      },
    ],
    persistedSessions: [],
    editingSessionId: null,
    editingSessionTitle: '',
    setSessionDrafts: vi.fn(),
    setStreamingSessionResponses: vi.fn(),
    setOpenSessionMenuId: vi.fn(),
    setEditingSessionId: vi.fn(),
    setEditingSessionTitle: vi.fn(),
    setSessionSearch: vi.fn(),
    sessionSearch: '',
    sessionDrafts: [],
    sessionGoalDismissed: new Set<string>(),
    setSessionGoalDismissed: vi.fn(),
    sessionGoalInput: '',
    setSessionGoalInput: vi.fn(),
    sessionGoals: {},
    setSessionGoal: vi.fn(),
    pendingDeleteSessionSummary: null,
    refreshPersistedSessions: vi.fn(),
    renamePersistedSession: vi.fn(),
    ...overrides,
  };
}

function renderUseSessionWorkspace(options?: {
  artworksLoaded?: boolean;
  activeTab?: 'newSession' | 'collect' | 'profile' | 'learn';
  artworkDetailItem?: ArtworkDetailItem | null;
  sessionStateOverrides?: Record<string, unknown>;
}) {
  const sessionStateMock = createSessionStateMock(options?.sessionStateOverrides);
  const preparedReset = vi.fn();
  const submitPreparedSession = vi.fn();
  const sessionActions = { handleDeleteSession: vi.fn() };
  const messaging = {
    appendSessionEvents: vi.fn(),
    sendSessionInquiryToSession: vi.fn(),
  };

  mockUseSessionState.mockReturnValue(sessionStateMock);
  mockUsePreparedSessionStaging.mockReturnValue({
    pendingSessionArtworks: [],
    newSessionDraftMessage: '',
    isSubmittingPreparedSession: false,
    setIsSubmittingPreparedSession: vi.fn(),
    resetPreparedSessionState: preparedReset,
  });
  mockUseSessionMessaging.mockReturnValue(messaging);
  mockUseSessionActions.mockReturnValue(sessionActions);
  mockUseSessionStartFlow.mockReturnValue({ submitPreparedSession });

  const updateArtworkSessionLinks = vi.fn();
  const setVisit = vi.fn();
  const setDeleteConfirmation = vi.fn();
  const setActiveTab = vi.fn();
  const clearShellOverlays = vi.fn();
  const showToast = vi.fn();
  const renameInput = {
    focus: vi.fn(),
    select: vi.fn(),
  } as unknown as HTMLInputElement;
  const sessionStreamScroll = { scrollTop: 123 } as HTMLDivElement;
  const sessionStreamEnd = { scrollIntoView: vi.fn() } as unknown as HTMLDivElement;
  const ingestPreparedUploads = vi.fn<(
    uploadEntries: PreparedSessionUploadEntry[],
    context: PreparedUploadSessionContext,
  ) => Promise<PreparedUploadIngestResult>>().mockResolvedValue({
    persistedItems: [],
    analysisPromise: Promise.resolve([]),
  });

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useSessionWorkspace({
    userId: 'user-1',
    items: [],
    artworksLoaded: options?.artworksLoaded ?? true,
    deleteConfirmation: null,
    defaultSessionTitle: 'Untitled Session',
    initialIsComposingNewSession: false,
    activeTab: options?.activeTab ?? 'collect',
    artworkDetailItem: options?.artworkDetailItem ?? null,
    renameInputRef: { current: renameInput },
    sessionStreamScrollRef: { current: sessionStreamScroll },
    sessionStreamEndRef: { current: sessionStreamEnd },
    updateArtworkSessionLinks,
    setVisit,
    setDeleteConfirmation,
    setActiveTab,
    clearShellOverlays,
    showToast,
    ingestPreparedUploads,
  }), { wrapper });

  return {
    ...hook,
    sessionStateMock,
    preparedReset,
    submitPreparedSession,
    sessionActions,
    messaging,
    spies: {
      updateArtworkSessionLinks,
      setVisit,
      setDeleteConfirmation,
      setActiveTab,
      clearShellOverlays,
      showToast,
      ingestPreparedUploads,
      renameInput,
      sessionStreamScroll,
      sessionStreamEnd,
    },
  };
}

describe('useSessionWorkspace', () => {
  beforeEach(() => {
    mockFetchSessionMessages.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resets to a blank session and opens an existing session summary', () => {
    const { result, sessionStateMock, preparedReset, spies } = renderUseSessionWorkspace({
      activeTab: 'collect',
      sessionStateOverrides: { sessionSummaries: [] },
      artworksLoaded: false,
    });

    expect(result.current.sessionsLoading).toBe(true);

    act(() => {
      result.current.enterBlankSession();
    });

    expect(spies.setActiveTab).toHaveBeenCalledWith('newSession');
    expect(sessionStateMock.setFilteredSessionId).toHaveBeenCalledWith(null);
    expect(sessionStateMock.setIsComposingNewSession).toHaveBeenCalledWith(true);
    expect(preparedReset).toHaveBeenCalledTimes(1);
    expect(spies.setVisit).toHaveBeenCalledWith({
      id: '',
      itemIds: [],
      globalConversation: [],
    });

    act(() => {
      result.current.openSessionSummary('session-42');
    });

    expect(spies.setActiveTab).toHaveBeenLastCalledWith('newSession');
    expect(sessionStateMock.setFilteredSessionId).toHaveBeenLastCalledWith('session-42');
    expect(sessionStateMock.setIsComposingNewSession).toHaveBeenLastCalledWith(false);
  });

  it('hydrates missing DB messages into the active visit stream without duplicating existing ones', async () => {
    const existingMessage = createSessionMessage({ id: 'existing', createdAt: 200, text: 'existing' });
    const sessionStateMock = createSessionStateMock({
      sessionStreams: { 'session-1': [existingMessage] },
      setSessionStreams: vi.fn(),
    });

    mockUseSessionState.mockReturnValue(sessionStateMock);
    mockUsePreparedSessionStaging.mockReturnValue({
      pendingSessionArtworks: [],
      newSessionDraftMessage: '',
      isSubmittingPreparedSession: false,
      setIsSubmittingPreparedSession: vi.fn(),
      resetPreparedSessionState: vi.fn(),
    });
    mockUseSessionMessaging.mockReturnValue({
      appendSessionEvents: vi.fn(),
      sendSessionInquiryToSession: vi.fn(),
    });
    mockUseSessionActions.mockReturnValue({});
    mockUseSessionStartFlow.mockReturnValue({ submitPreparedSession: vi.fn() });

    mockFetchSessionMessages.mockResolvedValue([
      {
        id: 'from-db',
        role: 'user',
        content: 'from database',
        type: 'text',
        sequence_number: 1,
        created_at: 150,
      },
      {
        id: 'existing',
        role: 'model',
        content: 'existing',
        sequence_number: 2,
        created_at: 200,
      },
    ]);

    renderUseSessionWorkspace({
      activeTab: 'newSession',
      sessionStateOverrides: sessionStateMock,
    });

    await waitFor(() => {
      expect(mockFetchSessionMessages).toHaveBeenCalledWith('session-1');
      expect(sessionStateMock.setSessionStreams).toHaveBeenCalled();
    });

    const updater = sessionStateMock.setSessionStreams.mock.calls[0][0] as (
      prev: Record<string, SessionStreamMessage[]>
    ) => Record<string, SessionStreamMessage[]>;

    const next = updater({ 'session-1': [existingMessage] });
    expect(next['session-1']).toHaveLength(2);
    expect(next['session-1'][0]).toMatchObject({
      id: 'from-db',
      text: 'from database',
      role: 'user',
      createdAt: 150,
    });
    expect(next['session-1'][1]).toMatchObject({
      id: 'existing',
      text: 'existing',
      createdAt: 200,
    });
  });

  it('refetch replaces confirmed history but keeps the whole unconfirmed optimistic overlay', async () => {
    // In-flight optimistic events: no sequenceNumber yet, POSTs not confirmed.
    const inFlightUserMessage = createSessionMessage({
      id: 'local-user', role: 'user', text: 'just sent', createdAt: 300, localOrder: 5,
    });
    const pendingCommentary = createSessionMessage({
      id: 'local-commentary', role: 'model', text: '', type: 'model_response',
      payload: { status: 'pending', response_kind: 'general' }, createdAt: 301, localOrder: 6,
    });
    // Confirmed on a previous fetch, but no longer returned by the backend →
    // backend wins for confirmed history; it must be dropped.
    const staleConfirmed = createSessionMessage({
      id: 'stale-confirmed', role: 'model', text: 'deleted upstream', createdAt: 100, sequenceNumber: 9,
    });
    const sessionStateMock = createSessionStateMock({
      sessionStreams: { 'session-1': [staleConfirmed, inFlightUserMessage, pendingCommentary] },
      setSessionStreams: vi.fn(),
    });

    mockUseSessionState.mockReturnValue(sessionStateMock);
    mockUsePreparedSessionStaging.mockReturnValue({
      pendingSessionArtworks: [],
      newSessionDraftMessage: '',
      isSubmittingPreparedSession: false,
      setIsSubmittingPreparedSession: vi.fn(),
      resetPreparedSessionState: vi.fn(),
    });
    mockUseSessionMessaging.mockReturnValue({
      appendSessionEvents: vi.fn(),
      sendSessionInquiryToSession: vi.fn(),
    });
    mockUseSessionActions.mockReturnValue({});
    mockUseSessionStartFlow.mockReturnValue({ submitPreparedSession: vi.fn() });

    mockFetchSessionMessages.mockResolvedValue([
      { id: 'db-1', role: 'user', content: 'question', type: 'text', sequence_number: 1, created_at: 150 },
      { id: 'db-2', role: 'model', content: 'answer', sequence_number: 2, created_at: 200 },
    ]);

    renderUseSessionWorkspace({
      activeTab: 'newSession',
      sessionStateOverrides: sessionStateMock,
    });

    await waitFor(() => {
      expect(sessionStateMock.setSessionStreams).toHaveBeenCalled();
    });

    const updater = sessionStateMock.setSessionStreams.mock.calls[0][0] as (
      prev: Record<string, SessionStreamMessage[]>
    ) => Record<string, SessionStreamMessage[]>;

    const next = updater({ 'session-1': [staleConfirmed, inFlightUserMessage, pendingCommentary] });
    expect(next['session-1'].map((m) => m.id)).toEqual([
      'db-1',        // canonical, seq 1
      'db-2',        // canonical, seq 2
      'local-user',  // unconfirmed overlay survives, ordered by localOrder
      'local-commentary',
    ]);
  });

  it('maps canonical user_input DB events back into visible text messages', async () => {
    const sessionStateMock = createSessionStateMock({
      sessionStreams: { 'session-1': [] },
      setSessionStreams: vi.fn(),
    });

    mockUseSessionState.mockReturnValue(sessionStateMock);
    mockUsePreparedSessionStaging.mockReturnValue({
      pendingSessionArtworks: [],
      newSessionDraftMessage: '',
      isSubmittingPreparedSession: false,
      setIsSubmittingPreparedSession: vi.fn(),
      resetPreparedSessionState: vi.fn(),
    });
    mockUseSessionMessaging.mockReturnValue({
      appendSessionEvents: vi.fn(),
      sendSessionInquiryToSession: vi.fn(),
    });
    mockUseSessionActions.mockReturnValue({});
    mockUseSessionStartFlow.mockReturnValue({ submitPreparedSession: vi.fn() });

    mockFetchSessionMessages.mockResolvedValue([
      {
        id: 'evt-1',
        role: 'user',
        event_type: 'user_input',
        type: 'artwork_capture',
        content: 'compare these different native community artworks',
        artwork_ids: ['art-1', 'art-2', 'art-3'],
        created_at: 150,
      },
    ]);

    renderUseSessionWorkspace({
      activeTab: 'newSession',
      sessionStateOverrides: sessionStateMock,
    });

    await waitFor(() => {
      expect(mockFetchSessionMessages).toHaveBeenCalledWith('session-1');
      expect(sessionStateMock.setSessionStreams).toHaveBeenCalled();
    });

    const updater = sessionStateMock.setSessionStreams.mock.calls[0][0] as (
      prev: Record<string, SessionStreamMessage[]>
    ) => Record<string, SessionStreamMessage[]>;

    const next = updater({ 'session-1': [] });
    expect(next['session-1']).toEqual([
      expect.objectContaining({
        id: 'evt-1',
        role: 'user',
        type: 'text',
        text: 'compare these different native community artworks',
        triggerEventId: 'evt-1',
      }),
    ]);
  });

  it('does not fetch session messages outside the session workspace tab', async () => {
    renderUseSessionWorkspace({
      activeTab: 'collect',
    });

    await waitFor(() => {
      expect(mockFetchSessionMessages).not.toHaveBeenCalled();
    });
  });
});
