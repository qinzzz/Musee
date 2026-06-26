import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionWorkspace } from './useSessionWorkspace';
import type { GalleryItem, Visit } from '../../types';
import type { InterpretingItem } from '../../artwork/types';
import type { PreparedSessionUploadEntry, PreparedUploadSessionContext } from '../../artwork-ingest/types';
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
  fetchSessionMessages: mockFetchSessionMessages,
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
    setSessionGoals: vi.fn(),
    pendingDeleteSessionSummary: null,
    refreshPersistedSessions: vi.fn(),
    ...overrides,
  };
}

function renderUseSessionWorkspace(options?: {
  artworksLoaded?: boolean;
  activeTab?: 'newSession' | 'collect' | 'profile' | 'learn';
  interpretingItem?: InterpretingItem | null;
  sessionStateOverrides?: Record<string, unknown>;
}) {
  const sessionStateMock = createSessionStateMock(options?.sessionStateOverrides);
  const preparedReset = vi.fn();
  const submitPreparedSession = vi.fn();
  const sessionActions = { handleDeleteSession: vi.fn() };
  const messaging = {
    appendSessionMessages: vi.fn(),
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

  const setItems = vi.fn();
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
  ) => Promise<GalleryItem[]>>().mockResolvedValue([]);

  const hook = renderHook(() => useSessionWorkspace({
    userId: 'user-1',
    items: [],
    artworksLoaded: options?.artworksLoaded ?? true,
    deleteConfirmation: null,
    defaultSessionTitle: 'Untitled Session',
    initialIsComposingNewSession: false,
    activeTab: options?.activeTab ?? 'collect',
    interpretingItem: options?.interpretingItem ?? null,
    renameInputRef: { current: renameInput },
    sessionStreamScrollRef: { current: sessionStreamScroll },
    sessionStreamEndRef: { current: sessionStreamEnd },
    setItems,
    setVisit,
    setDeleteConfirmation,
    setActiveTab,
    clearShellOverlays,
    showToast,
    ingestPreparedUploads,
  }));

  return {
    ...hook,
    sessionStateMock,
    preparedReset,
    submitPreparedSession,
    sessionActions,
    messaging,
    spies: {
      setItems,
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
      appendSessionMessages: vi.fn(),
      sendSessionInquiryToSession: vi.fn(),
    });
    mockUseSessionActions.mockReturnValue({});
    mockUseSessionStartFlow.mockReturnValue({ submitPreparedSession: vi.fn() });

    mockFetchSessionMessages.mockResolvedValue([
      {
        id: 'existing',
        role: 'model',
        content: 'existing',
        created_at: 200,
      },
      {
        id: 'from-db',
        role: 'user',
        content: 'from database',
        type: 'text',
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

  it('does not fetch session messages outside the session workspace tab', async () => {
    renderUseSessionWorkspace({
      activeTab: 'collect',
    });

    await waitFor(() => {
      expect(mockFetchSessionMessages).not.toHaveBeenCalled();
    });
  });
});
