import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AppViewport from './AppViewport';
import type { SessionSummary } from '../../session/types';

vi.mock('../../capture/components/SessionCapturePage', () => ({
  default: () => <div>capture</div>,
}));

vi.mock('../../artwork/components/ArtworkDetailModal', () => ({
  default: () => <div>interpretation</div>,
}));

vi.mock('../../collection/components/CollectionView', () => ({
  default: () => <div>collect</div>,
}));

vi.mock('../../components/TasteProfileView', () => ({
  default: () => <div>taste</div>,
}));

vi.mock('../../artist/components/ArtistPage', () => ({
  default: () => <div>artist</div>,
}));

vi.mock('../../components/ArtMovementPage', () => ({
  default: () => <div>movement</div>,
}));

vi.mock('../../components/LearningHubPage', () => ({
  default: () => <div>learn</div>,
}));

vi.mock('../../session/components/SessionView', () => ({
  default: (props: {
    onSubmitGoal: (goal: string) => void;
    onSaveExistingGoal: (goal: string) => void;
    isSessionBusy: boolean;
    sessionHistoryStatus: 'loading' | 'ready' | 'error';
  }) => (
    <div>
      <span data-testid="session-history-status">{props.sessionHistoryStatus}</span>
      <button disabled={props.isSessionBusy} onClick={() => props.onSubmitGoal('Draft goal')}>submit-goal</button>
      <button onClick={() => props.onSaveExistingGoal('Updated goal')}>save-goal</button>
    </div>
  ),
}));

function createSessionSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'visit-1',
    title: 'Untitled Session',
    location: null,
    artworkCount: 0,
    updatedAt: Date.now(),
    dateLabel: null,
    items: [],
    ...overrides,
  };
}

function renderAppViewport(options: {
  isPersistedSessionId?: (sessionId: string) => boolean;
  handleSessionInquiry?: (text: string) => Promise<boolean>;
  isAnalyzing?: boolean;
  streamingSessionResponses?: Record<string, string>;
  sessionHistoryStatus?: 'loading' | 'ready' | 'error';
}) {
  const setSessionGoal = vi.fn();
  const setSessionGoalInput = vi.fn();
  const onSaveSessionGoal = vi.fn().mockResolvedValue(undefined);
  const refreshPersistedSessions = vi.fn();
  const handleSessionInquiry = vi.fn(
    options.handleSessionInquiry ?? (async () => true),
  );

  render(
    <AppViewport
      shell={{
        activeTab: 'newSession',
        collectTab: 'saved',
        learningInitialGuide: null,
        userId: 'user-1',
        headerMenuButton: null,
        collectionFloatingMenuButton: null,
        profileRefreshKey: 0,
      }}
      state={{
        artworksLoaded: true,
        sessionCaptureState: null,
        artistPageContext: null,
        movementPageContext: null,
        isComposingNewSession: false,
        activeSessionSummary: createSessionSummary(),
        activeSessionStream: [],
        activeSessionRenderBlocks: [],
        sessionTitleById: {},
        artworkDetailItem: null,
        artworkHeaderActions: null,
        artworkHeaderEditToken: 0,
        artworkDetailContext: null,
        artworkDetailRightMode: 'metadata',
        sessionGoalInput: 'Draft goal',
        sessionGoals: {},
        sessionGoalDismissed: new Set<string>(),
        streamingSessionResponses: options.streamingSessionResponses ?? {},
        goalGalleryInputRef: { current: null },
        pendingSessionArtworks: [],
        newSessionDraftMessage: '',
        isSubmittingPreparedSession: false,
        sessionHistoryStatus: options.sessionHistoryStatus ?? 'ready',
        retrySessionHistory: vi.fn().mockResolvedValue(undefined),
        sessionStreamScrollRef: { current: null },
        sessionStreamEndRef: { current: null },
        items: [],
        artworkWorkspace: { id: '', itemIds: [], globalConversation: [] },
        filteredSessionId: 'visit-1',
        isAnalyzing: options.isAnalyzing ?? false,
        likedIds: new Set<string>(),
        boards: [],
        boardsLoading: false,
      }}
      navigation={{
        closeSessionCapturePage: vi.fn(),
        handleSessionCaptureDirtyChange: vi.fn(),
        handleSessionCaptureSubmit: vi.fn(),
        closeArtistDetail: vi.fn(),
        openArtworkDetail: vi.fn(),
        navigateArtistIndex: vi.fn(),
        closeMovementPage: vi.fn(),
        closeArtworkDetail: vi.fn(),
        openArtistDetail: vi.fn(),
        handleSelectSessionSummary: vi.fn(),
        openSessionCapturePage: vi.fn(),
        setCollectTab: vi.fn(),
        openMovementPage: vi.fn(),
      }}
      actions={{
        updateItemMetadata: vi.fn(),
        handleUpdateClassification: vi.fn(),
        handleDeleteItems: vi.fn(),
        setDeleteConfirmation: vi.fn(),
        handleNavigateArtworkDetail: vi.fn(),
        setArtworkDetailRightMode: vi.fn(),
        handleIdentifyAgain: vi.fn(),
        handleRetryAnalysis: vi.fn(),
        setSessionGoal,
        isPersistedSessionId: options.isPersistedSessionId ?? (() => false),
        refreshPersistedSessions,
        saveSessionTitle: vi.fn(),
        showToast: vi.fn(),
        setSessionGoalInput,
        onSaveSessionGoal,
        setNewSessionDraftMessage: vi.fn(),
        setIsLibraryPickerOpen: vi.fn(),
        openSessionLibraryPicker: vi.fn(),
        submitStagedBatch: vi.fn(async () => true),
        isSubmittingStagedBatch: false,
        removePendingSessionArtwork: vi.fn(),
        submitPreparedSession: vi.fn(),
        handleFileUpload: vi.fn(),
        createBoard: vi.fn(),
        renameBoard: vi.fn(),
        deleteBoard: vi.fn(),
        addItemsToBoard: vi.fn(),
        handleDeleteItem: vi.fn(),
        setIsUnsortedFlowOpen: vi.fn(),
        handleToggleLike: vi.fn(),
        handleSessionInquiry,
      }}
    />,
  );

  return {
    setSessionGoal,
    setSessionGoalInput,
    onSaveSessionGoal,
    refreshPersistedSessions,
    handleSessionInquiry,
  };
}

describe('AppViewport session composer', () => {
  it('sends the opening question through session messaging', async () => {
    const spies = renderAppViewport({
      isPersistedSessionId: () => false,
    });

    fireEvent.click(screen.getByText('submit-goal'));

    await waitFor(() => {
      expect(spies.handleSessionInquiry).toHaveBeenCalledWith('Draft goal');
      expect(spies.setSessionGoalInput).toHaveBeenCalledWith('');
    });
    expect(spies.setSessionGoal).not.toHaveBeenCalled();
    expect(spies.onSaveSessionGoal).not.toHaveBeenCalled();
    expect(spies.refreshPersistedSessions).not.toHaveBeenCalled();
  });

  it('keeps the opening question when sending fails', async () => {
    const spies = renderAppViewport({
      handleSessionInquiry: async () => false,
    });

    fireEvent.click(screen.getByText('submit-goal'));

    await waitFor(() => {
      expect(spies.handleSessionInquiry).toHaveBeenCalledWith('Draft goal');
    });
    expect(spies.setSessionGoalInput).not.toHaveBeenCalled();
  });

  it('blocks the initial composer while the session is busy', () => {
    const spies = renderAppViewport({ isAnalyzing: true });

    const submitButton = screen.getByText('submit-goal');
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(submitButton);
    expect(spies.handleSessionInquiry).not.toHaveBeenCalled();
  });

  it('blocks the composer while session history is loading', () => {
    const spies = renderAppViewport({ sessionHistoryStatus: 'loading' });

    expect(screen.getByTestId('session-history-status').textContent).toBe('loading');
    const submitButton = screen.getByText('submit-goal');
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(submitButton);
    expect(spies.handleSessionInquiry).not.toHaveBeenCalled();
  });

  it('still persists goals edited from session details', async () => {
    const spies = renderAppViewport({
      isPersistedSessionId: () => true,
    });

    fireEvent.click(screen.getByText('save-goal'));

    await waitFor(() => {
      expect(spies.onSaveSessionGoal).toHaveBeenCalledWith('visit-1', 'Updated goal');
    });
    await waitFor(() => {
      expect(spies.refreshPersistedSessions).toHaveBeenCalled();
    });
  });
});
