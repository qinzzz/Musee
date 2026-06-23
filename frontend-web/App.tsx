import React, { Suspense, lazy, useState, useRef, useEffect } from 'react';
import { GalleryItem, Visit, TagCoordinate } from './types';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { toast as sonnerToast } from 'sonner';
import { getCurrentUser, getOrCreateUserId, getUserQuota, logout, type UserQuota } from './api/auth';
import {
  deleteArtwork,
  type SmartCollection,
} from './api/artworks';
import { setSessionGoal } from './session/api/sessions';
import IdentifyAgainModal from './components/IdentifyAgainModal';
import ArtworkActionsMenu from './components/ArtworkActionsMenu';
import AddFromLibraryModal from './components/AddFromLibraryModal';
import AppSidebar from './app-shell/components/AppSidebar';
import AppConfirmationLayer from './app-shell/components/AppConfirmationLayer';
import AppViewport from './app-shell/components/AppViewport';
import LoginModal from './app-shell/components/LoginModal';
import UserSettingsModal from './app-shell/components/UserSettingsModal';
import { Toaster } from './components/ui/sonner';
import { useAppNavigationSync } from './app-shell/hooks/useAppNavigationSync';
import { useAppShellNavigation } from './app-shell/hooks/useAppShellNavigation';
import { useCaptureNavigation } from './app-shell/hooks/useCaptureNavigation';
import { useArtworkDetailPager } from './app-shell/hooks/useArtworkDetailPager';
import { useDetailNavigation } from './app-shell/hooks/useDetailNavigation';
import { useArtworkLibrary } from './artwork/hooks/useArtworkLibrary';
import { useArtworkAnalysis } from './artwork/hooks/useArtworkAnalysis';
import { useBoards } from './boards/hooks/useBoards';
import { useSessionWorkspace } from './session/hooks/useSessionWorkspace';
import { useArtworkIngest } from './artwork-ingest/hooks/useArtworkIngest';
import type { PreparedSessionUploadEntry, PreparedUploadSessionContext } from './artwork-ingest/types';
import {
  getInitialNavigationState,
  type ArtistPageContext,
  type ArtworkDetailContext,
  type CollectTab,
} from './lib/appNavigation';
import { parseAnalysis } from './artwork/lib/analysisText';

const UnsortedClassificationModal = lazy(() => import('./components/UnsortedClassificationModal'));

type ToastAction = {
  label: string;
  onClick: () => void;
};

// Helper to format date strings to (Month Day, Year) without time
export const formatDisplayDate = (dateStr: string | null | undefined): string | null => {
  if (!dateStr) return null;
  // If it's a timestamp like "Feb 1, 2026, 8:31:14 PM" or "2026-02-01 20:31:14"
  // We want to just keep the date part. 
  // Custom EXIF format is "Feb 1, 2026" or "2024:12:18 15:30:00"

  try {
    // If it has a comma followed by time, split it
    if (dateStr.includes(', ')) {
      const parts = dateStr.split(', ');
      // Check if second or third part looks like time
      if (parts.length >= 3) {
        return `${parts[0]}, ${parts[1]}`;
      }
    }

    // If it has a space followed by time
    if (dateStr.includes(' ')) {
      const parts = dateStr.split(' ');
      // If it looks like ISO date + time "2026-02-01 20:31:14"
      if (parts[0].includes('-')) {
        const dt = new Date(dateStr);
        if (!isNaN(dt.getTime())) {
          return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
      }
      // If it looks like "Feb 1, 2026 20:31:14"
      if (parts.length >= 3 && parts[1].endsWith(',')) {
        return `${parts[0]} ${parts[1]} ${parts[2]}`;
      }
    }

    // Fallback: if it's just a raw ISO string or something
    const dt = new Date(dateStr);
    if (!isNaN(dt.getTime())) {
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    return dateStr;
  } catch (e) {
    return dateStr;
  }
};

// Persistent user ID for the current browser session
const USER_ID = getOrCreateUserId();
const DEFAULT_VISIT_TITLE = 'Untitled Session';

const App: React.FC = () => {
  const initialNavigationState = getInitialNavigationState(window.location.pathname);
  const goalGalleryInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const visitStreamScrollRef = useRef<HTMLDivElement>(null);
  const visitStreamEndRef = useRef<HTMLDivElement>(null);
  const [isUnsortedFlowOpen, setIsUnsortedFlowOpen] = useState(false);
  const [tagPositions, setTagPositions] = useState<Record<string, TagCoordinate>>({});
  const [activeTab, setActiveTab] = useState<'newSession' | 'collect' | 'profile' | 'learn'>(initialNavigationState.activeTab);
  const [learningInitialGuide] = useState<string | null>(initialNavigationState.learningInitialGuide);
  const [collectTab, setCollectTab] = useState<CollectTab>(initialNavigationState.collectTab);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(getCurrentUser());
  const sessionUserId = currentUser?.user_id || USER_ID;
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ id: string, type: 'item' | 'session' } | null>(null);
  const [artistPageContext, setArtistPageContext] = useState<ArtistPageContext | null>(initialNavigationState.artistPageContext);
  const [movementPageContext, setMovementPageContext] = useState<SmartCollection | null>(null);
  const [artworkDetailContext, setArtworkDetailContext] = useState<ArtworkDetailContext | null>(null);
  const [artworkHeaderEditToken, setArtworkHeaderEditToken] = useState(0);

  const showToast = (message: string, type: 'info' | 'success' = 'info', action?: ToastAction) => {
    const options = action
      ? {
          action: {
            label: action.label,
            onClick: action.onClick,
          },
        }
      : undefined;

    if (type === 'success') {
      sonnerToast.success(message, options);
      return;
    }

    sonnerToast.info(message, options);
  };

  const {
    items,
    setItems,
    artworksLoaded,
    profileRefreshKey,
    interpretingItem,
    setInterpretingItem,
    buildInterpretingItem,
    restoreArtworkFromHistory,
    handleUpdateClassification,
    updateItemMetadata,
  } = useArtworkLibrary({
    userId: sessionUserId,
    showToast,
    onMissingArtworkFromHistory: () => setArtworkDetailContext(null),
    onArtworkDetailContextChange: setArtworkDetailContext,
    onTagPositionsLoaded: (updater) => setTagPositions(updater),
  });

  const {
    clearShellOverlays,
    openArtworkDetail,
    openArtistDetail,
    closeArtworkDetail,
    closeArtistDetail,
    navigateArtistIndex,
    openMovementPage,
    closeMovementPage,
  } = useDetailNavigation({
    activeTab,
    collectTab,
    setArtistPageContext,
    setMovementPageContext,
    artworkDetailContext,
    setArtworkDetailContext,
    buildInterpretingItem,
    setInterpretingItem,
    setArtworkHeaderEditToken,
    setActiveTab,
    setCollectTab,
  });

  const {
    captureState: sessionCaptureState,
    setCaptureState: setSessionCaptureState,
    showCaptureExitModal,
    cancelCaptureExit: handleCancelCaptureExit,
    confirmCaptureExit: handleConfirmCaptureExit,
    handleRequestLeaveCapture: handleRequestLeaveSessionCapture,
    openCapturePage: openSessionCapturePage,
    closeCapturePage: closeSessionCapturePage,
    handleCaptureDirtyChange: handleSessionCaptureDirtyChange,
    exitCaptureAfterSubmit,
  } = useCaptureNavigation({
    activeTab,
    collectTab,
  });

  const {
    navigateInterpretation: handleNavigateInterpretation,
  } = useArtworkDetailPager({
    activeTab,
    collectTab,
    artworkDetailContext,
    interpretingItem,
    setInterpretingItem,
  });

  useAppNavigationSync({
    activeTab,
    collectTab,
    artistPageContext,
    movementPageContext,
    artworkDetailContext,
    captureState: sessionCaptureState,
    interpretingItem,
    onRestoreArtworkFromHistory: restoreArtworkFromHistory,
    onSetArtistPageContext: setArtistPageContext,
    onSetMovementPageContext: setMovementPageContext,
    onSetArtworkDetailContext: setArtworkDetailContext,
    onSetCaptureState: setSessionCaptureState,
    onRequestLeaveCapture: handleRequestLeaveSessionCapture,
    onSetActiveTab: setActiveTab,
    onSetCollectTab: setCollectTab,
    onSetInterpretingItem: setInterpretingItem,
  });

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState<'account' | 'personalization' | null>(null);
  const [quotaInfo, setQuotaInfo] = useState<UserQuota | null>(null);
  const [language, setLanguage] = useState(localStorage.getItem('musee_language') || 'en');

  const [likedIds, setLikedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('musee_liked_ids') || '[]')); }
    catch { return new Set(); }
  });

  const handleLoginSuccess = (user: any) => {
    setCurrentUser(user);
    // Reload artworks list for the new user
    window.location.reload();
  };

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
    window.location.reload();
  };

  const handleToggleLike = (id: string) => {
    setLikedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem('musee_liked_ids', JSON.stringify([...next]));
      return next;
    });
  };

  const [interpretationRightMode, setInterpretationRightMode] = useState<'metadata' | 'community'>('metadata');

  const [visit, setVisit] = useState<Visit>({
    id: 'initial-' + Math.random().toString(36).substring(7),
    itemIds: [],
    globalConversation: []
  });

  const {
    boards,
    boardsLoading,
    addItemsToBoard,
    createBoard,
    renameBoard,
    deleteBoard,
  } = useBoards({
    userId: currentUser?.user_id || USER_ID,
    showToast,
  });

  const ingestPreparedUploadsRef = useRef<(
    uploadEntries: PreparedSessionUploadEntry[],
    context: PreparedUploadSessionContext,
  ) => Promise<GalleryItem[]>>(async () => []);

  const sessionWorkspace = useSessionWorkspace({
    userId: sessionUserId,
    items,
    artworksLoaded,
    deleteConfirmation,
    defaultVisitTitle: DEFAULT_VISIT_TITLE,
    initialIsComposingNewSession: initialNavigationState.activeTab === 'newSession',
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
    ingestPreparedUploads: (uploadEntries, context) => ingestPreparedUploadsRef.current(uploadEntries, context),
  });

  const {
    visits: {
      visitSearch,
      setVisitSearch,
      filteredVisitId,
      setFilteredVisitId,
      isComposingNewSession,
      openVisitMenuId,
      setOpenVisitMenuId,
      editingVisitId,
      setEditingVisitId,
      editingVisitTitle,
      setEditingVisitTitle,
      setVisitDrafts,
      visitStreams,
      sessionGoalDismissed,
      setSessionGoalDismissed,
      sessionGoalInput,
      setSessionGoalInput,
      sessionGoals,
      setSessionGoals,
      visitSummaries,
      activeVisitSummary,
      pendingDeleteVisitSummary,
      activeVisitStream,
      refreshPersistedSessions,
      streamingVisitResponses,
    },
    prepared: {
      pendingSessionArtworks,
      setPendingSessionArtworks,
      newSessionDraftMessage,
      setNewSessionDraftMessage,
      isLibraryPickerOpen,
      setIsLibraryPickerOpen,
      libraryPickerSearch,
      setLibraryPickerSearch,
      isSubmittingPreparedSession,
      pendingLibraryArtworkIds,
      availableLibraryArtworks,
      stageLibraryArtworkForSession,
      removePendingSessionArtwork,
    },
    messaging: {
      createVisitDraft,
      ensureSessionRecord,
      resolveUploadSession,
      appendVisitMessages,
      sendVisitInquiryToSession,
      triggerUploadCommentary,
      handleVisitInquiry,
    },
    sessionActions: {
      handleDeleteSession,
      handleStartRenameVisit,
      saveVisitTitle,
      commitVisitRename,
      confirmDeleteSession,
    },
    submitPreparedSession,
    pendingDeletedSessionIds,
    recentVisitSummaries,
    sessionsLoading,
    enterBlankSession,
    openSessionSummary,
  } = sessionWorkspace;

  const removeArtworkLocally = React.useCallback((itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
    setVisit((prev) => ({
      ...prev,
      itemIds: prev.itemIds.filter((id) => id !== itemId),
    }));
    setInterpretingItem((prev) => (prev?.id === itemId ? null : prev));
  }, [setItems, setVisit, setInterpretingItem]);

  const {
    updateSavedArtworkInState,
    applyArtworkAnalysisResult,
    markArtworkAnalysisFailed,
    handleFileUpload,
    handleSessionCaptureSubmit,
    ingestPreparedUploads,
  } = useArtworkIngest({
    userId: sessionUserId,
    defaultVisitTitle: DEFAULT_VISIT_TITLE,
    activeTab,
    isComposingNewSession,
    pendingSessionArtworks,
    items,
    visitStreams,
    setPendingSessionArtworks,
    setItems,
    setVisit,
    setInterpretingItem,
    setTagPositions,
    setVisitDrafts,
    setIsAnalyzing,
    setFilteredVisitId,
    showToast,
    parseAnalysis,
    resolveUploadSession,
    appendVisitMessages,
    triggerUploadCommentary,
    onExitSessionCapture: exitCaptureAfterSubmit,
  });
  ingestPreparedUploadsRef.current = ingestPreparedUploads;

  const {
    showHeaderIdentifyAgainModal,
    headerIdentifyAgainValues,
    headerIdentifyAgainError,
    isHeaderIdentifyingAgain,
    handleRetryAnalysis,
    handleIdentifyAgain,
    openHeaderIdentifyAgainModal,
    closeHeaderIdentifyAgainModal,
    updateHeaderIdentifyAgainValues,
    submitHeaderIdentifyAgain,
  } = useArtworkAnalysis({
    interpretingItem,
    updateSavedArtworkInState,
    applyArtworkAnalysisResult,
    markArtworkAnalysisFailed,
  });

  // Reset interpretation panel state when opening a new artwork
  useEffect(() => {
    setInterpretationRightMode('metadata');
  }, [interpretingItem?.id]);

  useEffect(() => {
    if (currentUser?.user_id) {
      getUserQuota(currentUser.user_id).then(setQuotaInfo).catch(() => {});
    }
  }, [currentUser?.user_id]);

  const handleDeleteItem = (id: string) => {
    setDeleteConfirmation({ id, type: 'item' });
  };

  const confirmDeleteItem = async (id: string) => {
    const itemToDelete = items.find(item => item.id === id);
    if (!itemToDelete) {
      setDeleteConfirmation(null);
      return;
    }

    const deleteTargetId = itemToDelete.artworkId || itemToDelete.id;
    setDeleteConfirmation(null);
    setInterpretingItem((prev) => (prev?.id === id ? null : prev));
    updateSavedArtworkInState(id, {
      deleteStatus: 'pending',
    });

    try {
      await deleteArtwork(deleteTargetId, sessionUserId);
      removeArtworkLocally(id);
      showToast('Artwork deleted', 'success');
      console.log(`Successfully deleted artwork: ${id}`);
    } catch (error) {
      console.error("Failed to delete artwork:", error);
      updateSavedArtworkInState(id, {
        deleteStatus: undefined,
      });
      showToast('Could not delete artwork', 'info');
    }
  };

  const {
    isDesktopViewport,
    sidebarOpen,
    sidebarCollapsed,
    recentsOpen,
    setRecentsOpen,
    userMenuOpen,
    setUserMenuOpen,
    isNewSessionEntryActive,
    navigationItems: sidebarNavigationItems,
    handleSelectVisitSummary,
    openSidebar,
    closeMobileSidebar,
    expandSidebar,
    collapseSidebar,
  } = useAppShellNavigation({
    activeTab,
    isComposingNewSession,
    editingVisitId,
    clearShellOverlays,
    onSetActiveTab: setActiveTab,
    onEnterBlankSession: enterBlankSession,
    onOpenSessionSummary: openSessionSummary,
    onCloseVisitMenu: () => setOpenVisitMenuId(null),
  });

  const artworkHeaderActions = interpretingItem?.artworkId ? (
    <ArtworkActionsMenu
      disabled={Boolean(interpretingItem.isAnalyzing || interpretingItem.deleteStatus === 'pending')}
      onEdit={!interpretingItem.isAnalyzing && interpretingItem.deleteStatus !== 'pending' ? () => setArtworkHeaderEditToken(token => token + 1) : undefined}
      onIdentifyAgain={!interpretingItem.isAnalyzing && interpretingItem.deleteStatus !== 'pending' ? openHeaderIdentifyAgainModal : undefined}
      onDelete={interpretingItem.deleteStatus !== 'pending' ? () => setDeleteConfirmation({ type: 'item', id: interpretingItem.id }) : undefined}
      buttonClassName="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-200/50 hover:text-neutral-900 active:text-neutral-900"
      iconClassName="h-[18px] w-[18px]"
    />
  ) : null;

  const headerMenuButton = !isDesktopViewport && !sidebarOpen ? (
    <button
      onClick={openSidebar}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50"
      title="Open menu"
      aria-label="Open menu"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <line x1="4" y1="7" x2="20" y2="7" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="17" x2="20" y2="17" />
      </svg>
    </button>
  ) : null;

  const collectionFloatingMenuButton = !isDesktopViewport && !sidebarOpen ? (
    <button
      onClick={openSidebar}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50"
      title="Open menu"
      aria-label="Open menu"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <line x1="4" y1="7" x2="20" y2="7" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="17" x2="20" y2="17" />
      </svg>
    </button>
  ) : null;
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
  const userAvatar = currentUser?.profile_picture_url ? (
    <img
      src={currentUser.profile_picture_url}
      alt={currentUser.username || 'User avatar'}
      className="h-full w-full rounded-full object-cover"
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-[12px] font-bold text-neutral-900">
      {currentUser ? currentUser.username[0] : 'U'}
    </div>
  );

  const viewportShell = {
    activeTab,
    collectTab,
    learningInitialGuide,
    userId: currentUser?.user_id || USER_ID,
    headerMenuButton,
    collectionFloatingMenuButton,
    profileRefreshKey,
  };

  const viewportState = {
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
    pendingSessionArtworks: pendingSessionArtworks.map((entry) => ({
      id: entry.id,
      previewUrl: entry.previewUrl,
      label: entry.label,
      sublabel: entry.sublabel,
      kind: entry.kind,
    })),
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
  };

  const viewportNavigation = {
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
  };

  const viewportActions = {
    updateItemMetadata,
    handleUpdateClassification,
    setDeleteConfirmation,
    handleNavigateInterpretation,
    setInterpretationRightMode,
    handleIdentifyAgain,
    handleRetryAnalysis,
    setSessionGoals,
    ensureSessionRecord,
    refreshPersistedSessions,
    saveVisitTitle,
    showToast,
    createVisitDraft,
    setSessionGoalInput,
    onSaveSessionGoal: setSessionGoal,
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
  };

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <div
        className="relative flex h-dvh w-screen flex-row overflow-hidden bg-[var(--color-bg-primary)] text-neutral-900"
      >
        <Toaster />

        <Suspense fallback={null}>
          <UnsortedClassificationModal
            open={isUnsortedFlowOpen}
            items={items}
            onClose={() => setIsUnsortedFlowOpen(false)}
            onClassify={handleUpdateClassification}
          />
        </Suspense>

        <AddFromLibraryModal
          open={isLibraryPickerOpen}
          items={availableLibraryArtworks}
          selectedIds={pendingLibraryArtworkIds}
          searchValue={libraryPickerSearch}
          onClose={() => {
            setIsLibraryPickerOpen(false);
            setLibraryPickerSearch('');
          }}
          onSearchChange={setLibraryPickerSearch}
          onToggleSelect={stageLibraryArtworkForSession}
          onConfirm={() => setIsLibraryPickerOpen(false)}
        />

        <LoginModal
          open={showLoginModal && !currentUser}
          onClose={() => setShowLoginModal(false)}
          onLoginSuccess={(user) => {
            handleLoginSuccess(user);
            setShowLoginModal(false);
          }}
          onLoginError={() => alert('Login Error')}
        />

        <UserSettingsModal
          open={Boolean(showAccountModal)}
          mode={showAccountModal}
          currentUser={currentUser}
          quotaInfo={quotaInfo}
          language={language}
          onClose={() => setShowAccountModal(null)}
          onLanguageChange={(nextLanguage) => {
            setLanguage(nextLanguage);
            localStorage.setItem('musee_language', nextLanguage);
          }}
          onLogout={handleLogout}
        />

        {!sessionCaptureState && (
          <AppSidebar
            sidebarOpen={sidebarOpen}
            sidebarCollapsed={sidebarCollapsed}
            recentsOpen={recentsOpen}
            userMenuOpen={userMenuOpen}
            visitSearch={visitSearch}
            language={language}
            sessionsLoading={sessionsLoading}
            recentVisitSummaries={recentVisitSummaries}
            visitSummaries={visitSummaries}
            activeVisitSummaryId={activeVisitSummary?.id}
            isNewSessionEntryActive={isNewSessionEntryActive}
            editingVisitId={editingVisitId}
            editingVisitTitle={editingVisitTitle}
            openVisitMenuId={openVisitMenuId}
            pendingDeletedSessionIds={pendingDeletedSessionIds}
            currentUsername={currentUser?.username}
            isAuthenticated={Boolean(currentUser)}
            userAvatar={userAvatar}
            renameInputRef={renameInputRef}
            navigationItems={sidebarNavigationItems}
            onRecentsOpenChange={setRecentsOpen}
            onUserMenuOpenChange={setUserMenuOpen}
            onVisitSearchChange={setVisitSearch}
            onEditingVisitTitleChange={setEditingVisitTitle}
            onCommitVisitRename={commitVisitRename}
            onCancelVisitRename={() => {
              setEditingVisitId(null);
              setEditingVisitTitle('');
            }}
            onOpenVisitMenuChange={(summaryId, open) => setOpenVisitMenuId(open ? summaryId : null)}
            onSelectVisitSummary={handleSelectVisitSummary}
            onStartRenameVisit={handleStartRenameVisit}
            onDeleteSession={handleDeleteSession}
            onLanguageChange={(nextLanguage) => {
              setLanguage(nextLanguage);
              localStorage.setItem('musee_language', nextLanguage);
            }}
            onOpenSettings={() => setShowAccountModal('account')}
            onSignIn={() => setShowLoginModal(true)}
            onSignOut={handleLogout}
            onExpandSidebar={expandSidebar}
            onCollapseSidebar={collapseSidebar}
            onCloseMobileSidebar={closeMobileSidebar}
          />
        )}

        {/* Right-hand Canvas main container */}
        <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
          
          <AppViewport
            shell={viewportShell}
            state={viewportState}
            navigation={viewportNavigation}
            actions={viewportActions}
          />

        <IdentifyAgainModal
          open={showHeaderIdentifyAgainModal}
          values={headerIdentifyAgainValues}
          error={headerIdentifyAgainError}
          isSubmitting={isHeaderIdentifyingAgain}
          onValuesChange={updateHeaderIdentifyAgainValues}
          onClose={closeHeaderIdentifyAgainModal}
          onSubmit={() => void submitHeaderIdentifyAgain()}
        />

        <AppConfirmationLayer
          deleteConfirmation={deleteConfirmation}
          pendingDeleteVisitSummary={pendingDeleteVisitSummary}
          showCaptureExitModal={showCaptureExitModal}
          onCloseDeleteConfirmation={() => setDeleteConfirmation(null)}
          onConfirmDeleteItem={confirmDeleteItem}
          onConfirmDeleteSession={confirmDeleteSession}
          onCancelCaptureExit={handleCancelCaptureExit}
          onConfirmCaptureExit={handleConfirmCaptureExit}
        />

      </main>



      </div>
    </GoogleOAuthProvider>
  );
};

export default App;
