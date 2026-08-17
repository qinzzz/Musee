import React, { Suspense, lazy } from 'react';
import EmptyWall from '../../components/EmptyWall';
import ContextualActionBar, { SESSION_QUESTION_PLACEHOLDER } from '../../components/ContextualActionBar';
import ArtworkDetailModal from '../../artwork/components/ArtworkDetailModal';
import SessionCapturePage from '../../capture/components/SessionCapturePage';
import SessionView from '../../session/components/SessionView';
import type { AppTab, ArtistPageContext, ArtworkDetailContext, CollectTab } from '../../lib/appNavigation';
import { stateToPath } from '../../lib/appNavigation';
import type { ArtworkClassification, ArtworkWorkspace, GalleryItem } from '../../types';
import type { SmartCollection } from '../../api/artworks';
import type { Board } from '../../boards/types';
import type { ArtworkDetailItem } from '../../artwork/types';
import type { ActiveSessionStreamEntry, SessionRenderBlock, SessionSummary } from '../../session/types';
import { useSessionProcessingState } from '../../session/hooks/useSessionProcessingState';
import { isSessionProcessing } from '../../session/lib/sessionProcessingState';
import type { CaptureState } from '../hooks/useCaptureNavigation';
import type { GuestInteractionGate } from '../../guest/guestExperience';

const CollectionView = lazy(() => import('../../collection/components/CollectionView'));
const TasteProfileView = lazy(() => import('../../components/TasteProfileView'));
const ArtistPage = lazy(() => import('../../artist/components/ArtistPage'));
const ArtMovementPage = lazy(() => import('../../components/ArtMovementPage'));
const LearningHubPage = lazy(() => import('../../components/LearningHubPage'));

const ScreenLoader: React.FC<{ label?: string }> = ({ label = 'Loading' }) => (
  <div className="flex h-full w-full items-center justify-center bg-[var(--color-bg-primary)]">
    <p className="text-[12px] text-neutral-300">{label}…</p>
  </div>
);

type PreparedSessionEntry = {
  id: string;
  previewUrl: string;
  label: string;
  sublabel: string;
  kind: 'library' | 'upload';
};

type ShellViewportProps = {
  activeTab: AppTab;
  collectTab: CollectTab;
  learningInitialGuide: string | null;
  userId: string;
  headerMenuButton: React.ReactNode;
  collectionFloatingMenuButton: React.ReactNode;
  profileRefreshKey: number;
  interactionGate?: GuestInteractionGate;
  artworkInputLimit?: number;
  onSignIn?: () => void;
};

type ViewportStateProps = {
  artworksLoaded: boolean;
  sessionCaptureState: CaptureState;
  artistPageContext: ArtistPageContext | null;
  movementPageContext: SmartCollection | null;
  isComposingNewSession: boolean;
  activeSessionSummary: SessionSummary | null;
  activeSessionStream: ActiveSessionStreamEntry[];
  activeSessionRenderBlocks: SessionRenderBlock[];
  artworkDetailItem: ArtworkDetailItem | null;
  artworkHeaderActions: React.ReactNode;
  artworkHeaderEditToken: number;
  artworkDetailContext: ArtworkDetailContext | null;
  artworkDetailRightMode: 'metadata' | 'community';
  sessionGoalInput: string;
  sessionGoals: Record<string, string>;
  sessionGoalDismissed: Set<string>;
  streamingSessionResponses: Record<string, string>;
  goalGalleryInputRef: React.RefObject<HTMLInputElement | null>;
  pendingSessionArtworks: PreparedSessionEntry[];
  newSessionDraftMessage: string;
  isSubmittingPreparedSession: boolean;
  sessionHistoryStatus: 'loading' | 'ready' | 'error';
  retrySessionHistory: () => Promise<unknown>;
  sessionStreamScrollRef: React.RefObject<HTMLDivElement | null>;
  sessionStreamEndRef: React.RefObject<HTMLDivElement | null>;
  items: GalleryItem[];
  artworkWorkspace: ArtworkWorkspace;
  filteredSessionId: string | null;
  isAnalyzing: boolean;
  likedIds: Set<string>;
  boards: Board[];
  boardsLoading: boolean;
  sessionTitleById: Record<string, string>;
  activeInputPipelineSessionId: string | null;
};

type ViewportNavigationProps = {
  closeSessionCapturePage: () => void;
  handleSessionCaptureDirtyChange: (hasUnsavedCaptures: boolean) => void;
  handleSessionCaptureSubmit: (payload: { artwork: File; label: File | null; coords?: { latitude: number; longitude: number } }) => Promise<void>;
  closeArtistDetail: () => void;
  openArtworkDetail: (item: GalleryItem, context: ArtworkDetailContext, allItems?: GalleryItem[]) => void;
  navigateArtistIndex: () => void;
  closeMovementPage: () => void;
  closeArtworkDetail: () => void;
  openArtistDetail: (context: ArtistPageContext) => void;
  handleSelectSessionSummary: (summaryId: string) => void;
  openSessionCapturePage: () => void;
  setCollectTab: React.Dispatch<React.SetStateAction<CollectTab>>;
  openMovementPage: (collection: SmartCollection) => void;
};

type ViewportMutationProps = {
  updateItemMetadata: (itemId: string, fields: Partial<GalleryItem>) => void;
  handleUpdateClassification: (itemId: string, classification: ArtworkClassification) => Promise<void>;
  setDeleteConfirmation: React.Dispatch<React.SetStateAction<{ id: string; type: 'item' | 'session' } | null>>;
  handleNavigateArtworkDetail: (direction: 'prev' | 'next') => void;
  setArtworkDetailRightMode: React.Dispatch<React.SetStateAction<'metadata' | 'community'>>;
  handleIdentifyAgain: (hints?: { artistName?: string; artworkName?: string; additionalClue?: string }) => Promise<void>;
  handleRetryAnalysis: (item: GalleryItem) => Promise<void>;
  setSessionGoal: (sessionId: string, goal: string) => void;
  isPersistedSessionId: (sessionId: string) => boolean;
  refreshPersistedSessions: () => void;
  saveSessionTitle: (sessionId: string, nextTitle: string) => Promise<void>;
  showToast: (message: string, type?: 'info' | 'success', action?: { label: string; onClick: () => void }) => void;
  setSessionGoalInput: React.Dispatch<React.SetStateAction<string>>;
  onSaveSessionGoal: (sessionId: string, goal: string) => Promise<void>;
  setNewSessionDraftMessage: React.Dispatch<React.SetStateAction<string>>;
  setIsLibraryPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openSessionLibraryPicker: () => void;
  removePendingSessionArtwork: (entryId: string) => void;
  submitPreparedSession: () => Promise<void>;
  submitStagedBatch: (sessionId: string, message: string) => Promise<boolean>;
  isSubmittingStagedBatch: boolean;
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>, mode: 'gallery' | 'camera') => void;
  createBoard: (name: string, itemIds?: string[]) => Promise<Board>;
  renameBoard: (boardId: string, name: string) => Promise<Board>;
  deleteBoard: (boardId: string) => Promise<void>;
  addItemsToBoard: (boardId: string, itemIds: string[]) => Promise<void>;
  handleDeleteItem: (id: string) => void;
  handleDeleteItems: (itemIds: string[]) => void | Promise<void>;
  setIsUnsortedFlowOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleToggleLike: (id: string) => void;
  handleSessionInquiry: (text: string) => Promise<boolean>;
  onSessionAuthenticationRequired: (retry: {
    sessionId: string;
    responseId: string;
    message: string;
    parentEventId?: string;
  }) => void;
};

type Props = {
  shell: ShellViewportProps;
  state: ViewportStateProps;
  navigation: ViewportNavigationProps;
  actions: ViewportMutationProps;
};

export default function AppViewport({
  shell,
  state,
  navigation,
  actions,
}: Props) {
  const {
    activeTab,
    collectTab,
    learningInitialGuide,
    userId,
    headerMenuButton,
    collectionFloatingMenuButton,
    profileRefreshKey,
    interactionGate,
    artworkInputLimit,
    onSignIn,
  } = shell;
  const {
    artworksLoaded,
    sessionCaptureState,
    artistPageContext,
    movementPageContext,
    isComposingNewSession,
    activeSessionSummary,
    activeSessionStream,
    activeSessionRenderBlocks,
    artworkDetailItem,
    artworkHeaderActions,
    artworkHeaderEditToken,
    artworkDetailContext,
    artworkDetailRightMode,
    sessionGoalInput,
    sessionGoals,
    sessionGoalDismissed,
    streamingSessionResponses,
    goalGalleryInputRef,
    pendingSessionArtworks,
    newSessionDraftMessage,
    isSubmittingPreparedSession,
    sessionHistoryStatus,
    retrySessionHistory,
    sessionStreamScrollRef,
    sessionStreamEndRef,
    items,
    artworkWorkspace,
    filteredSessionId,
    isAnalyzing,
    likedIds,
    boards,
    boardsLoading,
    sessionTitleById,
    activeInputPipelineSessionId,
  } = state;
  const {
    closeSessionCapturePage,
    handleSessionCaptureDirtyChange,
    handleSessionCaptureSubmit,
    closeArtistDetail,
    openArtworkDetail,
    navigateArtistIndex,
    closeMovementPage,
    closeArtworkDetail,
    openArtistDetail,
    handleSelectSessionSummary,
    openSessionCapturePage,
    setCollectTab,
    openMovementPage,
  } = navigation;
  const {
    updateItemMetadata,
    handleUpdateClassification,
    setDeleteConfirmation,
    handleNavigateArtworkDetail,
    setArtworkDetailRightMode,
    handleIdentifyAgain,
    handleRetryAnalysis,
    setSessionGoal,
    isPersistedSessionId,
    refreshPersistedSessions,
    saveSessionTitle,
    showToast,
    setSessionGoalInput,
    onSaveSessionGoal,
    setNewSessionDraftMessage,
    setIsLibraryPickerOpen,
    openSessionLibraryPicker,
    removePendingSessionArtwork,
    submitPreparedSession,
    submitStagedBatch,
    isSubmittingStagedBatch,
    handleFileUpload,
    createBoard,
    renameBoard,
    deleteBoard,
    addItemsToBoard,
    handleDeleteItem,
    handleDeleteItems,
    setIsUnsortedFlowOpen,
    handleToggleLike,
    handleSessionInquiry,
    onSessionAuthenticationRequired,
  } = actions;
  const isSessionReplyPending = Boolean(
    activeSessionSummary
    && Object.prototype.hasOwnProperty.call(streamingSessionResponses, activeSessionSummary.id),
  );
  const hasAnySessionReplyPending = Object.keys(streamingSessionResponses).length > 0;
  const isArtworkInputPending = isSubmittingPreparedSession || isSubmittingStagedBatch;
  const isActiveInputPipelineSession = Boolean(
    activeSessionSummary?.id
    && activeSessionSummary.id === activeInputPipelineSessionId
  );
  const sessionProcessingState = useSessionProcessingState({
    activeSessionSummary,
    sessionRenderBlocks: activeSessionRenderBlocks,
    isAddingArtworks: Boolean(
      isArtworkInputPending
      && isActiveInputPipelineSession
    ),
    isAnalyzingArtworks: isAnalyzing && (
      activeInputPipelineSessionId === null || isActiveInputPipelineSession
    ),
    hasLiveResponse: isSessionReplyPending,
  });
  const isSessionBusy = Boolean(
    isArtworkInputPending
    || activeInputPipelineSessionId !== null
    || hasAnySessionReplyPending
    || isSessionProcessing(sessionProcessingState)
    || sessionHistoryStatus !== 'ready'
  );

  return (
    <>
      <div className="flex-1 min-h-0 relative flex flex-col">
        {sessionCaptureState ? (
          <SessionCapturePage
            key={sessionCaptureState.key}
            onClose={closeSessionCapturePage}
            onDirtyChange={handleSessionCaptureDirtyChange}
            onSubmit={handleSessionCaptureSubmit}
          />
        ) : artistPageContext ? (
          <div className="flex h-full min-w-0 flex-1 flex-col bg-[var(--color-bg-primary)] animate-in fade-in duration-300">
            <Suspense fallback={<ScreenLoader label="Loading artist" />}>
              <ArtistPage
                artistEntityId={artistPageContext.artistEntityId}
                artworkId={artistPageContext.artworkId}
                artistName={artistPageContext.artistName}
                parentLabel={artistPageContext.parentLabel}
                userId={userId}
                leftSlot={headerMenuButton}
                onClose={closeArtistDetail}
                onOpenArtwork={(item) => {
                  openArtworkDetail(item, {
                    parentLabel: artistPageContext.artistName || artistPageContext.artistEntityId || 'Artist',
                    basePath: window.location.pathname,
                    returnToArtistContext: artistPageContext,
                  });
                }}
                onNavigateToIndex={artistPageContext.returnToArtworkId ? undefined : navigateArtistIndex}
                isInline={true}
              />
            </Suspense>
          </div>
        ) : movementPageContext ? (
          <div className="flex h-full min-w-0 flex-1 flex-col bg-[var(--color-bg-primary)] animate-in fade-in duration-300">
            <Suspense fallback={<ScreenLoader label="Loading collection" />}>
              <ArtMovementPage
                collection={movementPageContext}
                items={items}
                leftSlot={headerMenuButton}
                onClose={closeMovementPage}
                onOpenArtwork={(item) => {
                  openArtworkDetail(item, {
                    parentLabel: movementPageContext.name,
                    basePath: window.location.pathname,
                  });
                }}
                isInline={true}
              />
            </Suspense>
          </div>
        ) : activeTab === 'newSession' ? (
          activeSessionSummary ? (
            <SessionView
              activeSessionSummary={activeSessionSummary}
              activeSessionStream={activeSessionStream}
              sessionRenderBlocks={activeSessionRenderBlocks}
              sessionTitleById={sessionTitleById}
              artworkDetailItem={artworkDetailItem}
              artworkHeaderActions={artworkHeaderActions}
              artworkHeaderEditToken={artworkHeaderEditToken}
              artworkDetailContext={artworkDetailContext}
              headerLeftSlot={headerMenuButton}
              showSessionHeader={!isComposingNewSession}
              artworkDetailRightMode={artworkDetailRightMode}
              sessionGoalInput={sessionGoalInput}
              sessionGoals={sessionGoals}
              sessionGoalDismissed={sessionGoalDismissed}
              streamingSessionResponse={streamingSessionResponses[activeSessionSummary.id]}
              userId={userId}
              goalGalleryInputRef={goalGalleryInputRef}
              preparedSessionItems={pendingSessionArtworks}
              preparedSessionMessage={newSessionDraftMessage}
              isSubmittingPreparedSession={isSubmittingPreparedSession}
              isSessionBusy={isSessionBusy}
              sessionProcessingState={sessionProcessingState}
              sessionHistoryStatus={sessionHistoryStatus}
              onRetrySessionHistory={() => void retrySessionHistory()}
              sessionStreamScrollRef={sessionStreamScrollRef}
              sessionStreamEndRef={sessionStreamEndRef}
              onCloseArtworkDetail={closeArtworkDetail}
              onUpdateMetadata={updateItemMetadata}
              onUpdateClassification={handleUpdateClassification}
              onDeleteArtwork={(itemId) => setDeleteConfirmation({ type: 'item', id: itemId })}
              onNavigateArtworkDetail={handleNavigateArtworkDetail}
              onArtworkDetailRightModeChange={setArtworkDetailRightMode}
              onIdentifyAgain={handleIdentifyAgain}
              onRetryAnalysis={handleRetryAnalysis}
              onOpenArtistFromInterpretation={(artistEntityId, artworkId, artistName) => {
                if (!artworkDetailItem) return;
                openArtistDetail({
                  artistEntityId,
                  artworkId,
                  artistName,
                  parentLabel: artworkDetailItem.artworkName || 'Untitled',
                  returnToArtworkId: artworkDetailItem.id,
                  returnToArtworkContext: artworkDetailContext || {
                    parentLabel: activeSessionSummary.title,
                    basePath: stateToPath(activeTab, collectTab),
                  },
                });
              }}
              onOpenSessionFromInterpretation={handleSelectSessionSummary}
              onSaveExistingGoal={(newGoal) => {
                const sid = activeSessionSummary.id;
                setSessionGoal(sid, newGoal);
                if (!isPersistedSessionId(sid)) {
                  return;
                }
                onSaveSessionGoal(sid, newGoal)
                  .then(() => {
                    refreshPersistedSessions();
                  })
                  .catch(() => {});
              }}
              onSaveSessionTitle={async (newTitle) => {
                try {
                  await saveSessionTitle(activeSessionSummary.id, newTitle);
                } catch (error) {
                  console.error('Failed to rename session from session header:', error);
                  showToast('Could not rename session', 'info');
                }
              }}
              onSessionGoalInputChange={setSessionGoalInput}
              onSubmitGoal={(question) => {
                if (isSessionBusy) return;
                void handleSessionInquiry(question).then((didSend) => {
                  if (didSend) {
                    setSessionGoalInput('');
                  }
                });
              }}
              onOpenSessionCapture={() => {
                if (!isSessionBusy) openSessionCapturePage();
              }}
              onPreparedSessionMessageChange={setNewSessionDraftMessage}
              onOpenLibraryPicker={() => {
                if (!isSessionBusy) setIsLibraryPickerOpen(true);
              }}
              onRemovePreparedSessionItem={removePendingSessionArtwork}
              onSubmitPreparedSession={() => {
                if (!isSessionBusy) void submitPreparedSession();
              }}
              onFileUpload={(event, mode) => {
                if (!isSessionBusy) handleFileUpload(event, mode);
              }}
              onOpenSessionArtwork={(item) =>
                openArtworkDetail(
                  item,
                  { parentLabel: activeSessionSummary.title, basePath: stateToPath(activeTab, collectTab) },
                  activeSessionSummary.items,
                )
              }
              onAuthenticationRequired={onSessionAuthenticationRequired}
              interactionGate={interactionGate}
              artworkInputLimit={artworkInputLimit}
              onSignIn={onSignIn}
            />
          ) : (
            <div className="relative flex flex-1 items-center justify-center bg-[var(--color-bg-primary)] px-6">
              {headerMenuButton ? (
                <div className="pointer-events-none absolute left-4 top-3 z-20 md:hidden">
                  <div className="pointer-events-auto">
                    {headerMenuButton}
                  </div>
                </div>
              ) : null}
              <EmptyWall isSessionMode={false} />
            </div>
          )
        ) : activeTab === 'collect' ? (
          <Suspense fallback={<ScreenLoader label="Loading collection" />}>
            <CollectionView
              headerLeftSlot={headerMenuButton}
              topLevelLeftSlot={collectionFloatingMenuButton}
              onFileUpload={handleFileUpload}
              artworksLoaded={artworksLoaded}
              items={items}
              artworkWorkspace={artworkWorkspace}
              filteredSessionId={filteredSessionId}
              isAnalyzing={isAnalyzing}
              likedIds={likedIds}
              boards={boards}
              boardsLoading={boardsLoading}
              sessionTitleById={sessionTitleById}
              userId={userId}
              collectTab={collectTab}
              artworkDetailItem={artworkDetailItem}
              artworkDetailContext={artworkDetailContext}
              artworkHeaderActions={artworkHeaderActions}
              artworkHeaderEditToken={artworkHeaderEditToken}
              artworkDetailRightMode={artworkDetailRightMode}
              onCloseArtworkDetail={closeArtworkDetail}
              onUpdateMetadata={updateItemMetadata}
              onUpdateClassification={handleUpdateClassification}
              onDeleteArtwork={(itemId) => setDeleteConfirmation({ type: 'item', id: itemId })}
              onNavigateArtworkDetail={handleNavigateArtworkDetail}
              onArtworkDetailRightModeChange={setArtworkDetailRightMode}
              onIdentifyAgain={handleIdentifyAgain}
              onRetryAnalysis={handleRetryAnalysis}
              onNavigateToArtistFromInterpretation={(artistEntityId, artworkId, artistName) => {
                if (!artworkDetailItem) return;
                openArtistDetail({
                  artistEntityId,
                  artworkId,
                  artistName,
                  parentLabel: artworkDetailItem.artworkName || 'Untitled',
                  returnToArtworkId: artworkDetailItem.id,
                  returnToArtworkContext: artworkDetailContext || {
                    parentLabel: 'All Artworks',
                    basePath: stateToPath(activeTab, collectTab),
                  },
                });
              }}
              onNavigateToSessionFromInterpretation={handleSelectSessionSummary}
              onCollectTabChange={setCollectTab}
              onCreateBoard={createBoard}
              onRenameBoard={renameBoard}
              onDeleteBoard={deleteBoard}
              onAddItemsToBoard={addItemsToBoard}
              onOpenArtist={(artistEntityId, artistName) => {
                openArtistDetail({
                  artistEntityId,
                  artistName,
                  parentLabel: 'Artists',
                });
              }}
              onInterpretArtwork={(item, context) => {
                const basePath = stateToPath(activeTab, collectTab);
                openArtworkDetail(item, {
                  parentLabel: context?.label || 'All Artworks',
                  basePath,
                }, context?.items);
              }}
              onDeleteItem={handleDeleteItem}
              onDeleteItems={handleDeleteItems}
              onStartUnsortedFlow={() => setIsUnsortedFlowOpen(true)}
            />
          </Suspense>
        ) : activeTab === 'profile' ? (
          <div className="relative flex h-full min-w-0 flex-1 flex-col bg-[var(--color-bg-primary)] overflow-hidden animate-in fade-in duration-300">
            {headerMenuButton ? (
              <div className="pointer-events-none absolute left-4 top-3 z-20 md:hidden">
                <div className="pointer-events-auto">
                  {headerMenuButton}
                </div>
              </div>
            ) : null}
            <div className="flex-1 overflow-y-auto">
              <Suspense fallback={<ScreenLoader label="Loading profile" />}>
                <TasteProfileView
                  userId={userId}
                  refreshKey={profileRefreshKey}
                  onStartUnsortedFlow={() => setIsUnsortedFlowOpen(true)}
                />
              </Suspense>
            </div>
          </div>
        ) : activeTab === 'learn' ? (
          <div className="flex-1 overflow-hidden bg-[var(--color-bg-primary)] pt-16 md:pt-0">
            <Suspense fallback={<ScreenLoader label="Loading library" />}>
              <LearningHubPage inline={true} initialGuide={learningInitialGuide} leftSlot={headerMenuButton} />
            </Suspense>
          </div>
        ) : null}
      </div>

      {artworkDetailItem && activeTab !== 'newSession' && activeTab !== 'collect' && (
        <ArtworkDetailModal
          item={artworkDetailItem}
          onClose={closeArtworkDetail}
          onUpdateMetadata={updateItemMetadata}
          onUpdateClassification={handleUpdateClassification}
          onDelete={() => setDeleteConfirmation({ type: 'item', id: artworkDetailItem.id })}
          onNavigate={handleNavigateArtworkDetail}
          rightMode={artworkDetailRightMode}
          onRightModeChange={setArtworkDetailRightMode}
          onIdentifyAgain={handleIdentifyAgain}
          onRetryAnalysis={() => handleRetryAnalysis(artworkDetailItem)}
            userId={userId}
            onNavigateToArtist={(artistEntityId, artworkId, artistName) => {
            openArtistDetail({
              artistEntityId,
              artworkId,
              artistName,
              parentLabel: artworkDetailItem.artworkName || 'Untitled',
              returnToArtworkId: artworkDetailItem.id,
              returnToArtworkContext: artworkDetailContext || {
                parentLabel: stateToPath(activeTab, collectTab),
                basePath: stateToPath(activeTab, collectTab),
              },
            });
          }}
          onNavigateToSession={handleSelectSessionSummary}
          sessionTitleById={sessionTitleById}
        />
      )}

      {activeTab === 'newSession' && !sessionCaptureState && !artworkDetailItem && !(
        activeSessionSummary &&
        activeSessionStream.length === 0 &&
        !sessionGoalDismissed.has(activeSessionSummary.id)
      ) && (
        <ContextualActionBar
          mode="session"
          onUpload={(event, mode) => {
            if (!isSessionBusy) handleFileUpload(event, mode);
          }}
          onOpenSessionCapture={() => {
            if (!isSessionBusy) openSessionCapturePage();
          }}
          onOpenLibraryPicker={() => {
            if (!isSessionBusy) openSessionLibraryPicker();
          }}
          isAnalyzing={sessionProcessingState.kind === 'analyzing_artworks'}
          isInquiryDisabled={sessionProcessingState.kind === 'writing_response'}
          isBusy={isSessionBusy}
          onInquiry={(text) => (
            isSessionBusy ? Promise.resolve(false) : handleSessionInquiry(text)
          )}
          stagedItems={activeSessionSummary ? pendingSessionArtworks : []}
          onRemoveStagedItem={removePendingSessionArtwork}
          onSubmitStagedBatch={(message) => (
            activeSessionSummary && !isSessionBusy
              ? submitStagedBatch(activeSessionSummary.id, message)
              : Promise.resolve(false)
          )}
          isSubmittingStagedBatch={isSubmittingStagedBatch}
          onLike={() => artworkDetailItem && handleToggleLike(artworkDetailItem.id)}
          isLiked={Boolean(artworkDetailItem && likedIds.has(artworkDetailItem.id))}
          onDelete={() => artworkDetailItem && setDeleteConfirmation({ type: 'item', id: artworkDetailItem.id })}
          onCollect={() => {}}
          onCommunity={() => setArtworkDetailRightMode((mode) => (mode === 'community' ? 'metadata' : 'community'))}
          isCommunityActive={artworkDetailRightMode === 'community'}
          activeItem={artworkDetailItem as unknown as GalleryItem || undefined}
          placeholder={activeSessionSummary ? SESSION_QUESTION_PLACEHOLDER : 'Start a session or capture an artwork...'}
          interactionGate={interactionGate}
          artworkInputLimit={artworkInputLimit}
          onSignIn={onSignIn}
        />
      )}
    </>
  );
}
