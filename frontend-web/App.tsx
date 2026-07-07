import React, { Suspense, lazy, useState, useRef, useEffect } from 'react';
import { ArtworkWorkspace, GalleryItem, TagCoordinate } from './types';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { toast as sonnerToast } from 'sonner';
import { getCurrentUser, getOrCreateUserId, logout } from './api/auth';
import {
  batchDeleteArtworks,
  deleteArtwork,
  type SmartCollection,
} from './api/artworks';
import { setSessionGoal as patchSessionGoal } from './session/api/sessions';
import IdentifyAgainModal from './components/IdentifyAgainModal';
import ArtworkActionsMenu from './components/ArtworkActionsMenu';
import AddFromLibraryModal from './components/AddFromLibraryModal';
import AppSidebar from './app-shell/components/AppSidebar';
import AccountUsageMeter from './app-shell/components/AccountUsageMeter';
import { useAccountUsageQuery } from './app-shell/hooks/useAccountUsageQuery';
import AppConfirmationLayer, { type DeleteConfirmationState } from './app-shell/components/AppConfirmationLayer';
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
import type { PreparedSessionUploadEntry, PreparedUploadIngestResult, PreparedUploadSessionContext } from './artwork-ingest/types';
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
  const sessionStreamScrollRef = useRef<HTMLDivElement>(null);
  const sessionStreamEndRef = useRef<HTMLDivElement>(null);
  const [isUnsortedFlowOpen, setIsUnsortedFlowOpen] = useState(false);
  const [tagPositions, setTagPositions] = useState<Record<string, TagCoordinate>>({});
  const [activeTab, setActiveTab] = useState<'newSession' | 'collect' | 'profile' | 'learn'>(initialNavigationState.activeTab);
  const [learningInitialGuide] = useState<string | null>(initialNavigationState.learningInitialGuide);
  const [collectTab, setCollectTab] = useState<CollectTab>(initialNavigationState.collectTab);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(getCurrentUser());
  const sessionUserId = currentUser?.user_id || USER_ID;
  // Single cached account-usage fetch, shared with the user-menu meter via
  // the query layer; the meter's mount-on-open refetch keeps both current.
  const { usage: accountUsage } = useAccountUsageQuery(sessionUserId);
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmationState>(null);
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
    patchArtwork,
    addLocalArtworks,
    replaceArtwork,
    removeArtwork,
    updateArtworkSessionLinks,
    refreshArtworks,
    artworksLoaded,
    profileRefreshKey,
    artworkDetailItem,
    artworkDetailSelection,
    setArtworkDetailSelection,
    buildArtworkDetailSelection,
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
    buildArtworkDetailSelection,
    setArtworkDetailSelection,
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
    navigateArtworkDetail: handleNavigateArtworkDetail,
  } = useArtworkDetailPager({
    activeTab,
    collectTab,
    artworkDetailContext,
    artworkDetailItem,
    setArtworkDetailSelection,
  });

  useAppNavigationSync({
    activeTab,
    collectTab,
    artistPageContext,
    movementPageContext,
    artworkDetailContext,
    captureState: sessionCaptureState,
    artworkDetailItem,
    onRestoreArtworkFromHistory: restoreArtworkFromHistory,
    onSetArtistPageContext: setArtistPageContext,
    onSetMovementPageContext: setMovementPageContext,
    onSetArtworkDetailContext: setArtworkDetailContext,
    onSetCaptureState: setSessionCaptureState,
    onRequestLeaveCapture: handleRequestLeaveSessionCapture,
    onSetActiveTab: setActiveTab,
    onSetCollectTab: setCollectTab,
    onClearArtworkDetailSelection: () => setArtworkDetailSelection(null),
  });

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState<'account' | 'personalization' | null>(null);
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

  const [artworkDetailRightMode, setArtworkDetailRightMode] = useState<'metadata' | 'community'>('metadata');
  const [artworkWorkspace, setArtworkWorkspace] = useState<ArtworkWorkspace>({
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
  ) => Promise<PreparedUploadIngestResult>>(async () => ({
    persistedItems: [],
    analysisPromise: Promise.resolve([]),
  }));

  const sessionWorkspace = useSessionWorkspace({
    userId: sessionUserId,
    items,
    artworksLoaded,
    deleteConfirmation,
    defaultSessionTitle: DEFAULT_VISIT_TITLE,
    initialIsComposingNewSession: initialNavigationState.activeTab === 'newSession',
    activeTab,
    artworkDetailItem,
    renameInputRef,
    sessionStreamScrollRef,
    sessionStreamEndRef,
    updateArtworkSessionLinks,
    setVisit: setArtworkWorkspace,
    setDeleteConfirmation,
    setActiveTab,
    clearShellOverlays,
    showToast,
    ingestPreparedUploads: (uploadEntries, context) => ingestPreparedUploadsRef.current(uploadEntries, context),
  });

  const {
    sessionState: {
      sessionSearch,
      setSessionSearch,
      filteredSessionId,
      setFilteredSessionId,
      isComposingNewSession,
      openSessionMenuId,
      setOpenSessionMenuId,
      editingSessionId,
      setEditingSessionId,
      editingSessionTitle,
      setEditingSessionTitle,
      setSessionDrafts,
      sessionStreams,
      sessionGoalDismissed,
      setSessionGoalDismissed,
      sessionGoalInput,
      setSessionGoalInput,
      sessionGoals,
      setSessionGoal,
      persistedSessions,
      sessionSummaries,
      activeSessionSummary,
      pendingDeleteSessionSummary,
      activeSessionStream,
      activeSessionRenderBlocks,
      refreshPersistedSessions,
      streamingSessionResponses,
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
      createSessionDraft,
      resolveUploadSession,
      appendSessionEvents,
      persistSessionArtworkInput,
      sendSessionInquiryToSession,
      triggerUploadCommentary,
      handleSessionInquiry,
    },
    sessionActions: {
      handleDeleteSession,
      handleStartRenameSession,
      saveSessionTitle,
      commitSessionRename,
      confirmDeleteSession,
    },
    submitPreparedSession,
    pendingDeletedSessionIds,
    recentSessionSummaries,
    sessionsLoading,
    enterBlankSession,
    openSessionSummary,
  } = sessionWorkspace;

  const removeArtworkLocally = React.useCallback((itemId: string) => {
    removeArtwork(itemId);
    setArtworkWorkspace((prev) => ({
      ...prev,
      itemIds: prev.itemIds.filter((id) => id !== itemId),
    }));
    setArtworkDetailSelection((prev) => (prev?.artworkClientId === itemId ? null : prev));
  }, [removeArtwork, setArtworkDetailSelection, setArtworkWorkspace]);

  const {
    updateSavedArtworkInState,
    applyArtworkAnalysisResult,
    markArtworkAnalysisFailed,
    handleFileUpload,
    handleSessionCaptureSubmit,
    ingestPreparedUploads,
  } = useArtworkIngest({
    userId: sessionUserId,
    defaultSessionTitle: DEFAULT_VISIT_TITLE,
    activeTab,
    isComposingNewSession,
    pendingSessionArtworks,
    items,
    sessionStreams,
    setPendingSessionArtworks,
    patchArtwork,
    addLocalArtworks,
    replaceArtwork,
    removeArtwork,
    setVisit: setArtworkWorkspace,
    artworkDetailSelection,
    setArtworkDetailSelection,
    setTagPositions,
    setSessionDrafts,
    setIsAnalyzing,
    setFilteredSessionId,
    showToast,
    parseAnalysis,
    resolveUploadSession,
    appendSessionEvents,
    persistSessionArtworkInput,
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
    artworkDetailItem,
    updateSavedArtworkInState,
    applyArtworkAnalysisResult,
    markArtworkAnalysisFailed,
  });

  // Reset interpretation panel state when opening a new artwork
  useEffect(() => {
    setArtworkDetailRightMode('metadata');
  }, [artworkDetailItem?.id]);

  const handleDeleteItem = (id: string) => {
    setDeleteConfirmation({ id, type: 'item' });
  };

  const handleDeleteItems = (itemIds: string[]) => {
    if (itemIds.length === 0) return;
    setDeleteConfirmation({
      type: 'items',
      ids: itemIds,
      count: itemIds.length,
    });
  };

  const performDeleteItems = async (itemIds: string[]) => {
    const targetItems = itemIds
      .map((itemId) => items.find((item) => item.id === itemId))
      .filter((item): item is GalleryItem => Boolean(item));

    if (targetItems.length === 0) {
      setDeleteConfirmation(null);
      return;
    }

    targetItems.forEach((item) => {
      updateSavedArtworkInState(item.id, {
        clientState: {
          deleteStatus: 'pending',
        },
      });
    });

    try {
      if (targetItems.length === 1) {
        const targetItem = targetItems[0];
        setArtworkDetailSelection((prev) => (prev?.artworkClientId === targetItem.id ? null : prev));
        await deleteArtwork(targetItem.artworkId || targetItem.id, sessionUserId);
      } else {
        await batchDeleteArtworks(
          targetItems.map((item) => item.artworkId || item.id),
          sessionUserId,
        );
      }

      targetItems.forEach((item) => {
        removeArtworkLocally(item.id);
      });
      refreshArtworks();
      showToast(
        targetItems.length === 1 ? 'Artwork deleted' : `${targetItems.length} artworks deleted`,
        'success',
      );
      console.log(`Successfully deleted artworks: ${targetItems.map((item) => item.id).join(', ')}`);
    } catch (error) {
      console.error('Failed to delete artworks:', error);
      targetItems.forEach((item) => {
        updateSavedArtworkInState(item.id, {
          clientState: {
            deleteStatus: undefined,
          },
        });
      });
      showToast(targetItems.length === 1 ? 'Could not delete artwork' : 'Could not delete artworks', 'info');
      throw error;
    }
  };

  const confirmDeleteItem = async (id: string) => {
    setDeleteConfirmation(null);
    await performDeleteItems([id]);
  };

  const confirmDeleteItems = async (ids: string[]) => {
    setDeleteConfirmation(null);
    await performDeleteItems(ids);
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
    handleSelectSessionSummary,
    openSidebar,
    closeMobileSidebar,
    expandSidebar,
    collapseSidebar,
  } = useAppShellNavigation({
    activeTab,
    isComposingNewSession,
    editingSessionId,
    clearShellOverlays,
    onSetActiveTab: setActiveTab,
    onEnterBlankSession: enterBlankSession,
    onOpenSessionSummary: openSessionSummary,
    onCloseSessionMenu: () => setOpenSessionMenuId(null),
  });
  const artworkHeaderActions = artworkDetailItem?.artworkId ? (
    <ArtworkActionsMenu
      disabled={Boolean(artworkDetailItem.isAnalyzing || artworkDetailItem.deleteStatus === 'pending')}
      onEdit={!artworkDetailItem.isAnalyzing && artworkDetailItem.deleteStatus !== 'pending' ? () => setArtworkHeaderEditToken(token => token + 1) : undefined}
      onIdentifyAgain={!artworkDetailItem.isAnalyzing && artworkDetailItem.deleteStatus !== 'pending' ? openHeaderIdentifyAgainModal : undefined}
      onDelete={artworkDetailItem.deleteStatus !== 'pending' ? () => setDeleteConfirmation({ type: 'item', id: artworkDetailItem.id }) : undefined}
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
    pendingSessionArtworks: pendingSessionArtworks.map((entry) => ({
      id: entry.id,
      previewUrl: entry.previewUrl,
      label: entry.label,
      sublabel: entry.sublabel,
      kind: entry.kind,
    })),
    newSessionDraftMessage,
    isSubmittingPreparedSession,
    sessionStreamScrollRef,
    sessionStreamEndRef,
    items,
    artworkWorkspace,
    filteredSessionId,
    isAnalyzing,
    likedIds,
    boards,
    boardsLoading,
    sessionTitleById: Object.fromEntries(sessionSummaries.map((session) => [session.id, session.title])),
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
    handleSelectSessionSummary,
    openSessionCapturePage,
    setCollectTab,
    openMovementPage,
  };

  const viewportActions = {
    updateItemMetadata,
    handleUpdateClassification,
    setDeleteConfirmation,
    handleNavigateArtworkDetail,
    setArtworkDetailRightMode,
    handleIdentifyAgain,
    handleRetryAnalysis,
    setSessionGoal,
    isPersistedSessionId: (sessionId: string) => persistedSessions.some((session) => session.id === sessionId),
    refreshPersistedSessions,
    saveSessionTitle,
    showToast,
    createSessionDraft,
    setSessionGoalInput,
    onSaveSessionGoal: patchSessionGoal,
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
    handleDeleteItems,
    setIsUnsortedFlowOpen,
    handleToggleLike,
    handleSessionInquiry,
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
          usage={accountUsage ?? null}
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
            sessionSearch={sessionSearch}
            language={language}
            sessionsLoading={sessionsLoading}
            recentSessionSummaries={recentSessionSummaries}
            sessionSummaries={sessionSummaries}
            activeSessionSummaryId={activeSessionSummary?.id}
            isNewSessionEntryActive={isNewSessionEntryActive}
            editingSessionId={editingSessionId}
            editingSessionTitle={editingSessionTitle}
            openSessionMenuId={openSessionMenuId}
            pendingDeletedSessionIds={pendingDeletedSessionIds}
            currentUsername={currentUser?.username}
            isAuthenticated={Boolean(currentUser)}
            accountUsageSlot={<AccountUsageMeter userId={sessionUserId} />}
            userAvatar={userAvatar}
            renameInputRef={renameInputRef}
            navigationItems={sidebarNavigationItems}
            onRecentsOpenChange={setRecentsOpen}
            onUserMenuOpenChange={setUserMenuOpen}
            onSessionSearchChange={setSessionSearch}
            onEditingSessionTitleChange={setEditingSessionTitle}
            onCommitSessionRename={commitSessionRename}
            onCancelSessionRename={() => {
              setEditingSessionId(null);
              setEditingSessionTitle('');
            }}
            onOpenSessionMenuChange={(summaryId, open) => setOpenSessionMenuId(open ? summaryId : null)}
            onSelectSessionSummary={handleSelectSessionSummary}
            onStartRenameSession={handleStartRenameSession}
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
          pendingDeleteSessionSummary={pendingDeleteSessionSummary}
          showCaptureExitModal={showCaptureExitModal}
          onCloseDeleteConfirmation={() => setDeleteConfirmation(null)}
          onConfirmDeleteItem={confirmDeleteItem}
          onConfirmDeleteItems={confirmDeleteItems}
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
