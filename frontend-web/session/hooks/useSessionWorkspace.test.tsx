import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionWorkspace } from './useSessionWorkspace';
import type { GalleryItem, Visit } from '../../types';
import type { InterpretingItem } from '../../artwork/types';
import type { PreparedSessionUploadEntry, PreparedUploadSessionContext } from '../../artwork-ingest/types';
import type { VisitStreamMessage } from '../types';

const {
  mockFetchSessionMessages,
  mockUsePreparedSessionStaging,
  mockUseSessionActions,
  mockUseSessionMessaging,
  mockUseSessionStartFlow,
  mockUseVisits,
} = vi.hoisted(() => ({
  mockFetchSessionMessages: vi.fn(),
  mockUsePreparedSessionStaging: vi.fn(),
  mockUseSessionActions: vi.fn(),
  mockUseSessionMessaging: vi.fn(),
  mockUseSessionStartFlow: vi.fn(),
  mockUseVisits: vi.fn(),
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

vi.mock('./useVisits', () => ({
  useVisits: mockUseVisits,
}));

function createVisitMessage(overrides: Partial<VisitStreamMessage> = {}): VisitStreamMessage {
  return {
    id: 'msg-1',
    role: 'model',
    text: 'hello',
    createdAt: 100,
    ...overrides,
  };
}

function createVisitsMock(overrides: Record<string, unknown> = {}) {
  return {
    filteredVisitId: 'session-1',
    setFilteredVisitId: vi.fn(),
    isComposingNewSession: false,
    setIsComposingNewSession: vi.fn(),
    activeVisitSummary: {
      id: 'session-1',
      title: 'Session 1',
      location: null,
      artworkCount: 0,
      updatedAt: Date.now(),
      dateLabel: null,
      items: [],
    },
    activeVisitStream: [createVisitMessage()],
    streamingVisitResponses: { 'session-1': 'streaming' },
    setVisitStreams: vi.fn(),
    visitStreams: {
      'session-1': [createVisitMessage({ id: 'existing', createdAt: 200 })],
    },
    visitSummaries: [
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
    editingVisitId: null,
    editingVisitTitle: '',
    setVisitDrafts: vi.fn(),
    setStreamingVisitResponses: vi.fn(),
    setOpenVisitMenuId: vi.fn(),
    setEditingVisitId: vi.fn(),
    setEditingVisitTitle: vi.fn(),
    setVisitSearch: vi.fn(),
    visitSearch: '',
    visitDrafts: [],
    sessionGoalDismissed: new Set<string>(),
    setSessionGoalDismissed: vi.fn(),
    sessionGoalInput: '',
    setSessionGoalInput: vi.fn(),
    sessionGoals: {},
    setSessionGoals: vi.fn(),
    pendingDeleteVisitSummary: null,
    refreshPersistedSessions: vi.fn(),
    ...overrides,
  };
}

function renderUseSessionWorkspace(options?: {
  artworksLoaded?: boolean;
  activeTab?: 'newSession' | 'collect' | 'profile' | 'learn';
  interpretingItem?: InterpretingItem | null;
  visitsOverrides?: Record<string, unknown>;
}) {
  const visitsMock = createVisitsMock(options?.visitsOverrides);
  const preparedReset = vi.fn();
  const submitPreparedSession = vi.fn();
  const sessionActions = { handleDeleteSession: vi.fn() };
  const messaging = {
    appendVisitMessages: vi.fn(),
    sendVisitInquiryToSession: vi.fn(),
  };

  mockUseVisits.mockReturnValue(visitsMock);
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
  const visitStreamScroll = { scrollTop: 123 } as HTMLDivElement;
  const visitStreamEnd = { scrollIntoView: vi.fn() } as unknown as HTMLDivElement;
  const ingestPreparedUploads = vi.fn<(
    uploadEntries: PreparedSessionUploadEntry[],
    context: PreparedUploadSessionContext,
  ) => Promise<GalleryItem[]>>().mockResolvedValue([]);

  const hook = renderHook(() => useSessionWorkspace({
    userId: 'user-1',
    items: [],
    artworksLoaded: options?.artworksLoaded ?? true,
    deleteConfirmation: null,
    defaultVisitTitle: 'Untitled Session',
    initialIsComposingNewSession: false,
    activeTab: options?.activeTab ?? 'collect',
    interpretingItem: options?.interpretingItem ?? null,
    renameInputRef: { current: renameInput },
    visitStreamScrollRef: { current: visitStreamScroll },
    visitStreamEndRef: { current: visitStreamEnd },
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
    visitsMock,
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
      visitStreamScroll,
      visitStreamEnd,
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
    const { result, visitsMock, preparedReset, spies } = renderUseSessionWorkspace({
      activeTab: 'collect',
      visitsOverrides: { visitSummaries: [] },
      artworksLoaded: false,
    });

    expect(result.current.sessionsLoading).toBe(true);

    act(() => {
      result.current.enterBlankSession();
    });

    expect(spies.setActiveTab).toHaveBeenCalledWith('newSession');
    expect(visitsMock.setFilteredVisitId).toHaveBeenCalledWith(null);
    expect(visitsMock.setIsComposingNewSession).toHaveBeenCalledWith(true);
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
    expect(visitsMock.setFilteredVisitId).toHaveBeenLastCalledWith('session-42');
    expect(visitsMock.setIsComposingNewSession).toHaveBeenLastCalledWith(false);
  });

  it('hydrates missing DB messages into the active visit stream without duplicating existing ones', async () => {
    const existingMessage = createVisitMessage({ id: 'existing', createdAt: 200, text: 'existing' });
    const visitsMock = createVisitsMock({
      visitStreams: { 'session-1': [existingMessage] },
      setVisitStreams: vi.fn(),
    });

    mockUseVisits.mockReturnValue(visitsMock);
    mockUsePreparedSessionStaging.mockReturnValue({
      pendingSessionArtworks: [],
      newSessionDraftMessage: '',
      isSubmittingPreparedSession: false,
      setIsSubmittingPreparedSession: vi.fn(),
      resetPreparedSessionState: vi.fn(),
    });
    mockUseSessionMessaging.mockReturnValue({
      appendVisitMessages: vi.fn(),
      sendVisitInquiryToSession: vi.fn(),
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
      visitsOverrides: visitsMock,
    });

    await waitFor(() => {
      expect(mockFetchSessionMessages).toHaveBeenCalledWith('session-1');
      expect(visitsMock.setVisitStreams).toHaveBeenCalled();
    });

    const updater = visitsMock.setVisitStreams.mock.calls[0][0] as (
      prev: Record<string, VisitStreamMessage[]>
    ) => Record<string, VisitStreamMessage[]>;

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
