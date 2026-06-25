import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AppViewport from './AppViewport';
import type { VisitSummary } from '../../session/types';

vi.mock('../../capture/components/SessionCapturePage', () => ({
  default: () => <div>capture</div>,
}));

vi.mock('../../components/InterpretationModal', () => ({
  default: () => <div>interpretation</div>,
}));

vi.mock('../../components/CollectView', () => ({
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

vi.mock('../../session/components/ExploreSessionView', () => ({
  default: (props: {
    onSubmitGoal: (goal: string) => void;
    onSaveExistingGoal: (goal: string) => void;
  }) => (
    <div>
      <button onClick={() => props.onSubmitGoal('Draft goal')}>submit-goal</button>
      <button onClick={() => props.onSaveExistingGoal('Updated goal')}>save-goal</button>
    </div>
  ),
}));

function createVisitSummary(overrides: Partial<VisitSummary> = {}): VisitSummary {
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
}) {
  const setSessionGoals = vi.fn();
  const setSessionGoalDismissed = vi.fn();
  const setSessionGoalInput = vi.fn();
  const onSaveSessionGoal = vi.fn().mockResolvedValue(undefined);
  const refreshPersistedSessions = vi.fn();

  render(
    <AppViewport
      shell={{
        activeTab: 'newSession',
        collectTab: 'all',
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
        activeVisitSummary: createVisitSummary(),
        activeVisitStream: [],
        interpretingItem: null,
        artworkHeaderActions: null,
        artworkHeaderEditToken: 0,
        artworkDetailContext: null,
        interpretationRightMode: 'metadata',
        sessionGoalInput: 'Draft goal',
        sessionGoals: {},
        sessionGoalDismissed: new Set<string>(),
        streamingVisitResponses: {},
        goalGalleryInputRef: { current: null },
        pendingSessionArtworks: [],
        newSessionDraftMessage: '',
        isSubmittingPreparedSession: false,
        visitStreamScrollRef: { current: null },
        visitStreamEndRef: { current: null },
        items: [],
        visit: { id: '', itemIds: [], globalConversation: [] },
        filteredVisitId: 'visit-1',
        isAnalyzing: false,
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
        handleSelectVisitSummary: vi.fn(),
        openSessionCapturePage: vi.fn(),
        setCollectTab: vi.fn(),
        openMovementPage: vi.fn(),
      }}
      actions={{
        updateItemMetadata: vi.fn(),
        handleUpdateClassification: vi.fn(),
        setDeleteConfirmation: vi.fn(),
        handleNavigateInterpretation: vi.fn(),
        setInterpretationRightMode: vi.fn(),
        handleIdentifyAgain: vi.fn(),
        handleRetryAnalysis: vi.fn(),
        setSessionGoals,
        isPersistedSessionId: options.isPersistedSessionId ?? (() => false),
        refreshPersistedSessions,
        saveVisitTitle: vi.fn(),
        showToast: vi.fn(),
        createVisitDraft: vi.fn(() => 'visit-1'),
        setSessionGoalInput,
        onSaveSessionGoal,
        setSessionGoalDismissed,
        setNewSessionDraftMessage: vi.fn(),
        setIsLibraryPickerOpen: vi.fn(),
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
        handleVisitInquiry: vi.fn().mockResolvedValue(true),
      }}
    />,
  );

  return {
    setSessionGoals,
    setSessionGoalDismissed,
    setSessionGoalInput,
    onSaveSessionGoal,
    refreshPersistedSessions,
  };
}

describe('AppViewport goal persistence', () => {
  it('keeps draft goals local when the session is not yet persisted', async () => {
    const spies = renderAppViewport({
      isPersistedSessionId: () => false,
    });

    fireEvent.click(screen.getByText('submit-goal'));
    fireEvent.click(screen.getByText('save-goal'));

    expect(spies.setSessionGoalInput).toHaveBeenCalledWith('');
    expect(spies.setSessionGoals).toHaveBeenCalled();
    expect(spies.setSessionGoalDismissed).toHaveBeenCalled();
    expect(spies.onSaveSessionGoal).not.toHaveBeenCalled();
    expect(spies.refreshPersistedSessions).not.toHaveBeenCalled();
  });

  it('persists goals when the session already exists server-side', async () => {
    const spies = renderAppViewport({
      isPersistedSessionId: () => true,
    });

    fireEvent.click(screen.getByText('submit-goal'));
    fireEvent.click(screen.getByText('save-goal'));

    await waitFor(() => {
      expect(spies.onSaveSessionGoal).toHaveBeenCalledWith('visit-1', 'Draft goal');
      expect(spies.onSaveSessionGoal).toHaveBeenCalledWith('visit-1', 'Updated goal');
    });
    await waitFor(() => {
      expect(spies.refreshPersistedSessions).toHaveBeenCalled();
    });
  });
});
