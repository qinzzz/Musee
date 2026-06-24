import React, { Suspense, lazy } from 'react';
import EmptyWall from '../../components/EmptyWall';
import ContextualActionBar from '../../components/ContextualActionBar';
import InterpretationModal from '../../components/InterpretationModal';
import SessionCapturePage from '../../capture/components/SessionCapturePage';
import ExploreSessionView from '../../session/components/ExploreSessionView';
import type { AppTab, ArtistPageContext, ArtworkDetailContext, CollectTab } from '../../lib/appNavigation';
import { stateToPath } from '../../lib/appNavigation';
import type { ArtworkClassification, GalleryItem, Visit } from '../../types';
import type { SmartCollection } from '../../api/artworks';
import type { Board } from '../../boards/types';
import type { InterpretingItem } from '../../artwork/types';
import type { ActiveVisitStreamEntry, VisitSummary } from '../../session/types';
import type { CaptureState } from '../hooks/useCaptureNavigation';

const CollectView = lazy(() => import('../../components/CollectView'));
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
};

type ViewportStateProps = {
  sessionCaptureState: CaptureState;
  artistPageContext: ArtistPageContext | null;
  movementPageContext: SmartCollection | null;
  isComposingNewSession: boolean;
  activeVisitSummary: VisitSummary | null;
  activeVisitStream: ActiveVisitStreamEntry[];
  interpretingItem: InterpretingItem | null;
  artworkHeaderActions: React.ReactNode;
  artworkHeaderEditToken: number;
  artworkDetailContext: ArtworkDetailContext | null;
  interpretationRightMode: 'metadata' | 'community';
  sessionGoalInput: string;
  sessionGoals: Record<string, string>;
  sessionGoalDismissed: Set<string>;
  streamingVisitResponses: Record<string, string>;
  goalGalleryInputRef: React.RefObject<HTMLInputElement | null>;
  pendingSessionArtworks: PreparedSessionEntry[];
  newSessionDraftMessage: string;
  isSubmittingPreparedSession: boolean;
  visitStreamScrollRef: React.RefObject<HTMLDivElement | null>;
  visitStreamEndRef: React.RefObject<HTMLDivElement | null>;
  items: GalleryItem[];
  visit: Visit;
  filteredVisitId: string | null;
  isAnalyzing: boolean;
  likedIds: Set<string>;
  boards: Board[];
  boardsLoading: boolean;
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
  handleSelectVisitSummary: (summaryId: string) => void;
  openSessionCapturePage: () => void;
  setCollectTab: React.Dispatch<React.SetStateAction<CollectTab>>;
  openMovementPage: (collection: SmartCollection) => void;
};

type ViewportMutationProps = {
  updateItemMetadata: (itemId: string, fields: Partial<GalleryItem>) => void;
  handleUpdateClassification: (itemId: string, classification: ArtworkClassification) => Promise<void>;
  setDeleteConfirmation: React.Dispatch<React.SetStateAction<{ id: string; type: 'item' | 'session' } | null>>;
  handleNavigateInterpretation: (direction: 'prev' | 'next') => void;
  setInterpretationRightMode: React.Dispatch<React.SetStateAction<'metadata' | 'community'>>;
  handleIdentifyAgain: (hints?: { artistName?: string; artworkName?: string; additionalClue?: string }) => Promise<void>;
  handleRetryAnalysis: (item: GalleryItem) => Promise<void>;
  setSessionGoals: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  isPersistedSessionId: (sessionId: string) => boolean;
  refreshPersistedSessions: () => void;
  saveVisitTitle: (visitId: string, nextTitle: string) => Promise<void>;
  showToast: (message: string, type?: 'info' | 'success', action?: { label: string; onClick: () => void }) => void;
  createVisitDraft: () => string;
  setSessionGoalInput: React.Dispatch<React.SetStateAction<string>>;
  onSaveSessionGoal: (sessionId: string, goal: string) => Promise<void>;
  setSessionGoalDismissed: React.Dispatch<React.SetStateAction<Set<string>>>;
  setNewSessionDraftMessage: React.Dispatch<React.SetStateAction<string>>;
  setIsLibraryPickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  removePendingSessionArtwork: (entryId: string) => void;
  submitPreparedSession: () => Promise<void>;
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>, mode: 'gallery' | 'camera') => void;
  createBoard: (name: string, itemIds?: string[]) => Promise<Board>;
  renameBoard: (boardId: string, name: string) => Promise<Board>;
  deleteBoard: (boardId: string) => Promise<void>;
  addItemsToBoard: (boardId: string, itemIds: string[]) => Promise<void>;
  handleDeleteItem: (id: string) => void;
  setIsUnsortedFlowOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleToggleLike: (id: string) => void;
  handleVisitInquiry: (text: string) => Promise<boolean>;
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
  } = shell;
  const {
    sessionCaptureState,
    artistPageContext,
    movementPageContext,
    isComposingNewSession,
    activeVisitSummary,
    activeVisitStream,
    interpretingItem,
    artworkHeaderActions,
    artworkHeaderEditToken,
    artworkDetailContext,
    interpretationRightMode,
    sessionGoalInput,
    sessionGoals,
    sessionGoalDismissed,
    streamingVisitResponses,
    goalGalleryInputRef,
    pendingSessionArtworks,
    newSessionDraftMessage,
    isSubmittingPreparedSession,
    visitStreamScrollRef,
    visitStreamEndRef,
    items,
    visit,
    filteredVisitId,
    isAnalyzing,
    likedIds,
    boards,
    boardsLoading,
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
    handleSelectVisitSummary,
    openSessionCapturePage,
    setCollectTab,
    openMovementPage,
  } = navigation;
  const {
    updateItemMetadata,
    handleUpdateClassification,
    setDeleteConfirmation,
    handleNavigateInterpretation,
    setInterpretationRightMode,
    handleIdentifyAgain,
    handleRetryAnalysis,
    setSessionGoals,
    isPersistedSessionId,
    refreshPersistedSessions,
    saveVisitTitle,
    showToast,
    createVisitDraft,
    setSessionGoalInput,
    onSaveSessionGoal,
    setSessionGoalDismissed,
    setNewSessionDraftMessage,
    setIsLibraryPickerOpen,
    removePendingSessionArtwork,
    submitPreparedSession,
    handleFileUpload,
    createBoard,
    renameBoard,
    deleteBoard,
    addItemsToBoard,
    handleDeleteItem,
    setIsUnsortedFlowOpen,
    handleToggleLike,
    handleVisitInquiry,
  } = actions;

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
          activeVisitSummary ? (
            <ExploreSessionView
              activeVisitSummary={activeVisitSummary}
              activeVisitStream={activeVisitStream}
              interpretingItem={interpretingItem}
              artworkHeaderActions={artworkHeaderActions}
              artworkHeaderEditToken={artworkHeaderEditToken}
              artworkDetailContext={artworkDetailContext}
              headerLeftSlot={headerMenuButton}
              showSessionHeader={!isComposingNewSession}
              interpretationRightMode={interpretationRightMode}
              sessionGoalInput={sessionGoalInput}
              sessionGoals={sessionGoals}
              sessionGoalDismissed={sessionGoalDismissed}
              streamingVisitResponse={streamingVisitResponses[activeVisitSummary.id]}
              userId={userId}
              goalGalleryInputRef={goalGalleryInputRef}
              preparedSessionItems={pendingSessionArtworks}
              preparedSessionMessage={newSessionDraftMessage}
              isSubmittingPreparedSession={isSubmittingPreparedSession}
              visitStreamScrollRef={visitStreamScrollRef}
              visitStreamEndRef={visitStreamEndRef}
              onCloseArtworkDetail={closeArtworkDetail}
              onUpdateMetadata={updateItemMetadata}
              onUpdateClassification={handleUpdateClassification}
              onDeleteArtwork={(itemId) => setDeleteConfirmation({ type: 'item', id: itemId })}
              onNavigateInterpretation={handleNavigateInterpretation}
              onInterpretationRightModeChange={setInterpretationRightMode}
              onIdentifyAgain={handleIdentifyAgain}
              onRetryAnalysis={handleRetryAnalysis}
              onOpenArtistFromInterpretation={(artistEntityId, artworkId, artistName) => {
                if (!interpretingItem) return;
                openArtistDetail({
                  artistEntityId,
                  artworkId,
                  artistName,
                  parentLabel: interpretingItem.artworkName || 'Untitled',
                  returnToArtworkId: interpretingItem.id,
                  returnToArtworkContext: artworkDetailContext || {
                    parentLabel: activeVisitSummary.title,
                    basePath: stateToPath(activeTab, collectTab),
                  },
                });
              }}
              onOpenSessionFromInterpretation={handleSelectVisitSummary}
              onSaveExistingGoal={(newGoal) => {
                const sid = activeVisitSummary.id;
                setSessionGoals(prev => ({ ...prev, [sid]: newGoal }));
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
                  await saveVisitTitle(activeVisitSummary.id, newTitle);
                } catch (error) {
                  console.error('Failed to rename visit from session header:', error);
                  showToast('Could not rename session', 'info');
                }
              }}
              onSessionGoalInputChange={setSessionGoalInput}
              onSubmitGoal={(goal) => {
                const sid = activeVisitSummary.id || createVisitDraft();
                setSessionGoalInput('');
                setSessionGoals(prev => ({ ...prev, [sid]: goal }));
                setSessionGoalDismissed(prev => new Set([...prev, sid]));
                if (!isPersistedSessionId(sid)) {
                  return;
                }
                onSaveSessionGoal(sid, goal)
                  .then(() => {
                    refreshPersistedSessions();
                  })
                  .catch(() => {});
              }}
              onOpenSessionCapture={openSessionCapturePage}
              onPreparedSessionMessageChange={setNewSessionDraftMessage}
              onOpenLibraryPicker={() => setIsLibraryPickerOpen(true)}
              onRemovePreparedSessionItem={removePendingSessionArtwork}
              onSubmitPreparedSession={() => void submitPreparedSession()}
              onFileUpload={handleFileUpload}
              onOpenSessionArtwork={(item) =>
                openArtworkDetail(
                  item,
                  { parentLabel: activeVisitSummary.title, basePath: stateToPath(activeTab, collectTab) },
                  activeVisitSummary.items,
                )
              }
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
              <EmptyWall isVisitMode={false} />
            </div>
          )
        ) : activeTab === 'collect' ? (
          <Suspense fallback={<ScreenLoader label="Loading collection" />}>
            <CollectView
              headerLeftSlot={headerMenuButton}
              topLevelLeftSlot={collectionFloatingMenuButton}
              onFileUpload={handleFileUpload}
              items={items}
              visit={visit}
              filteredVisitId={filteredVisitId}
              isAnalyzing={isAnalyzing}
              likedIds={likedIds}
              boards={boards}
              boardsLoading={boardsLoading}
              userId={userId}
              collectTab={collectTab}
              interpretingItem={interpretingItem}
              artworkDetailContext={artworkDetailContext}
              artworkHeaderActions={artworkHeaderActions}
              artworkHeaderEditToken={artworkHeaderEditToken}
              interpretationRightMode={interpretationRightMode}
              onCloseArtworkDetail={closeArtworkDetail}
              onUpdateMetadata={updateItemMetadata}
              onUpdateClassification={handleUpdateClassification}
              onDeleteArtwork={(itemId) => setDeleteConfirmation({ type: 'item', id: itemId })}
              onNavigateInterpretation={handleNavigateInterpretation}
              onInterpretationRightModeChange={setInterpretationRightMode}
              onIdentifyAgain={handleIdentifyAgain}
              onRetryAnalysis={handleRetryAnalysis}
              onNavigateToArtistFromInterpretation={(artistEntityId, artworkId, artistName) => {
                if (!interpretingItem) return;
                openArtistDetail({
                  artistEntityId,
                  artworkId,
                  artistName,
                  parentLabel: interpretingItem.artworkName || 'Untitled',
                  returnToArtworkId: interpretingItem.id,
                  returnToArtworkContext: artworkDetailContext || {
                    parentLabel: 'All Artworks',
                    basePath: stateToPath(activeTab, collectTab),
                  },
                });
              }}
              onNavigateToSessionFromInterpretation={handleSelectVisitSummary}
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
              onOpenMovement={openMovementPage}
              onInterpretArtwork={(item, context) => {
                const basePath = stateToPath(activeTab, collectTab);
                openArtworkDetail(item, {
                  parentLabel: context?.label || 'All Artworks',
                  basePath,
                }, context?.items);
              }}
              onDeleteItem={handleDeleteItem}
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

      {interpretingItem && activeTab !== 'newSession' && activeTab !== 'collect' && (
        <InterpretationModal
          item={interpretingItem}
          onClose={closeArtworkDetail}
          onUpdateMetadata={updateItemMetadata}
          onUpdateClassification={handleUpdateClassification}
          onDelete={() => setDeleteConfirmation({ type: 'item', id: interpretingItem.id })}
          allVisitItems={interpretingItem.allVisitItems}
          onNavigate={handleNavigateInterpretation}
          rightMode={interpretationRightMode}
          onRightModeChange={setInterpretationRightMode}
          onIdentifyAgain={handleIdentifyAgain}
          onRetryAnalysis={() => handleRetryAnalysis(interpretingItem)}
          userId={userId}
          onNavigateToArtist={(artistEntityId, artworkId, artistName) => {
            openArtistDetail({
              artistEntityId,
              artworkId,
              artistName,
              parentLabel: interpretingItem.artworkName || 'Untitled',
              returnToArtworkId: interpretingItem.id,
              returnToArtworkContext: artworkDetailContext || {
                parentLabel: stateToPath(activeTab, collectTab),
                basePath: stateToPath(activeTab, collectTab),
              },
            });
          }}
          onNavigateToSession={handleSelectVisitSummary}
          navigationContextLabel={artworkDetailContext?.parentLabel || 'Artwork Set'}
        />
      )}

      {activeTab === 'newSession' && !sessionCaptureState && !interpretingItem && !(
        activeVisitSummary &&
        activeVisitStream.length === 0 &&
        !sessionGoalDismissed.has(activeVisitSummary.id)
      ) && (
        <ContextualActionBar
          mode="session"
          onUpload={handleFileUpload}
          onOpenSessionCapture={openSessionCapturePage}
          isAnalyzing={isAnalyzing}
          onInquiry={handleVisitInquiry}
          onLike={() => interpretingItem && handleToggleLike(interpretingItem.id)}
          isLiked={Boolean(interpretingItem && likedIds.has(interpretingItem.id))}
          onDelete={() => interpretingItem && setDeleteConfirmation({ type: 'item', id: interpretingItem.id })}
          onCollect={() => {}}
          onCommunity={() => setInterpretationRightMode((mode) => (mode === 'community' ? 'metadata' : 'community'))}
          isCommunityActive={interpretationRightMode === 'community'}
          activeItem={interpretingItem as unknown as GalleryItem || undefined}
          placeholder={activeVisitSummary ? 'Add a reflection, memory, or association...' : 'Start a visit or capture an artwork...'}
        />
      )}
    </>
  );
}
