import React, { Suspense, lazy, useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArtworkWorkspace, TagCoordinate } from './types';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { toast as sonnerToast } from 'sonner';
import { consumePostAuthWelcome, getOrCreateUserId } from './api/auth';
import { useAuth } from './auth/AuthProvider';
import { type SmartCollection } from './api/artworks';
import { setSessionGoal as patchSessionGoal } from './session/api/sessions';
import IdentifyAgainModal from './components/IdentifyAgainModal';
import ArtworkActionsMenu from './components/ArtworkActionsMenu';
import AddFromLibraryModal from './components/AddFromLibraryModal';
import AppSidebar from './app-shell/components/AppSidebar';
import GuestSidebar from './guest/GuestSidebar';
import { deriveGuestExperience } from './guest/guestExperience';
import AccountUsageMeter from './app-shell/components/AccountUsageMeter';
import DevProfileSwitcher from './app-shell/components/DevProfileSwitcher';
import { useAccountUsageQuery } from './app-shell/hooks/useAccountUsageQuery';
import { useAppAuthFlow } from './app-shell/hooks/useAppAuthFlow';
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
import { useArtworkDeletion } from './artwork/hooks/useArtworkDeletion';
import { useBoards } from './boards/hooks/useBoards';
import { useSessionWorkspace } from './session/hooks/useSessionWorkspace';
import { useSessionArtworkInputPipeline } from './session/hooks/useSessionArtworkInputPipeline';
import { MAX_SESSION_ARTWORK_BATCH_SIZE } from './session/constants';
import { useArtworkUploadOperations } from './artwork-ingest/hooks/useArtworkUploadOperations';
import {
  buildRootHistoryState,
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
  const queryClient = useQueryClient();
  const {
    status: authStatus,
    currentUser,
    guestUserId,
    capabilities,
    quotas,
    completeLogin,
    continueAsGuest,
    logout: logoutCurrentSession,
  } = useAuth();
  const requestedNavigationState = getInitialNavigationState(window.location.pathname);
  const canSearchCollection = capabilities.search_collection === true;
  const canViewProfile = capabilities.view_profile === true;
  const initialNavigationState = (
    (requestedNavigationState.activeTab === 'collect' && !canSearchCollection)
    || (requestedNavigationState.activeTab === 'profile' && !canViewProfile)
  )
    ? {
        ...requestedNavigationState,
        activeTab: 'newSession' as const,
        artistPageContext: null,
      }
    : requestedNavigationState;
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
  const sessionUserId = currentUser?.user_id || guestUserId || USER_ID;
  // Single cached account-usage fetch, shared with the user-menu meter via
  // the query layer; the meter's mount-on-open refetch keeps both current.
  const { usage: accountUsage } = useAccountUsageQuery(sessionUserId);
  const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmationState>(null);
  const [artistPageContext, setArtistPageContext] = useState<ArtistPageContext | null>(initialNavigationState.artistPageContext);
  const [movementPageContext, setMovementPageContext] = useState<SmartCollection | null>(null);
  const [artworkDetailContext, setArtworkDetailContext] = useState<ArtworkDetailContext | null>(null);
  const [artworkHeaderEditToken, setArtworkHeaderEditToken] = useState(0);

  useEffect(() => {
    const isRestricted = (
      (activeTab === 'collect' && !canSearchCollection)
      || (activeTab === 'profile' && !canViewProfile)
    );
    if (!isRestricted) return;
    setActiveTab('newSession');
    setArtistPageContext(null);
    setMovementPageContext(null);
    setArtworkDetailContext(null);
    window.history.replaceState(buildRootHistoryState('newSession', 'saved'), '', '/');
  }, [activeTab, canSearchCollection, canViewProfile]);

  const showToast = React.useCallback((message: string, type: 'info' | 'success' = 'info', action?: ToastAction) => {
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
  }, []);

  useEffect(() => {
    const welcome = consumePostAuthWelcome();
    if (!welcome) return;
    showToast(welcome === 'new' ? 'Welcome to Musee.' : 'Welcome back.', 'success');
  }, []);

  const {
    items,
    patchArtwork,
    addLocalArtworks,
    replaceArtwork,
    removeArtwork,
    updateArtworkSessionLinks,
    refreshArtworks,
    refreshArtworksIfStale,
    refreshProfileDerivedData,
    artworksLoaded,
    artworksAuthoritative,
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
    canSearchCollection,
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

  const [showAccountModal, setShowAccountModal] = useState<'account' | 'personalization' | null>(null);
  const [language, setLanguage] = useState(localStorage.getItem('musee_language') || 'en');

  const [likedIds, setLikedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('musee_liked_ids') || '[]')); }
    catch { return new Set(); }
  });

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
    userId: sessionUserId,
    enabled: canSearchCollection,
    showToast,
  });

  const sessionWorkspace = useSessionWorkspace({
    userId: sessionUserId,
    items,
    artworksLoaded,
    artworksAuthoritative,
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
  });

  const {
    sessionState: {
      sessionSearch,
      setSessionSearch,
      filteredSessionId,
      setFilteredSessionId,
      isComposingNewSession,
      setIsComposingNewSession,
      openSessionMenuId,
      setOpenSessionMenuId,
      editingSessionId,
      setEditingSessionId,
      editingSessionTitle,
      setEditingSessionTitle,
      setSessionDrafts,
      sessionStreams,
      setSessionStreams,
      sessionGoalDismissed,
      sessionGoalInput,
      setSessionGoalInput,
      sessionGoals,
      setSessionGoal,
      persistedSessions,
      persistedSessionsHydrated,
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
      setIsSubmittingPreparedSession,
      pendingLibraryArtworkIds,
      availableLibraryArtworks,
      commitLibrarySelection,
      removePendingSessionArtwork,
      resetPreparedSessionState,
    },
    messaging: {
      appendSessionEvents,
      persistSessionArtworkInput,
      sendSessionInquiryToSession,
      retryAuthenticationRequiredResponse,
      handleSessionInquiry,
    },
    sessionActions: {
      handleDeleteSession,
      handleStartRenameSession,
      saveSessionTitle,
      commitSessionRename,
      confirmDeleteSession,
    },
    pendingDeletedSessionIds,
    recentSessionSummaries,
    sessionsLoading,
    sessionHistoryStatus,
    retrySessionHistory,
    enterBlankSession,
    openSessionSummary,
  } = sessionWorkspace;

  const guestUserMessageCount = React.useMemo(
    () => Object.values(sessionStreams).reduce((count, messages) => (
      count + messages.filter((message) => message.role === 'user').length
    ), 0),
    [sessionStreams],
  );
  const guestExperience = React.useMemo(() => deriveGuestExperience({
    quotas,
    hasSession: sessionSummaries.length > 0,
    userMessageCount: guestUserMessageCount,
    hasArtwork: items.length > 0 || pendingSessionArtworks.length > 0,
  }), [guestUserMessageCount, items.length, pendingSessionArtworks.length, quotas, sessionSummaries.length]);

  useEffect(() => {
    if (
      authStatus !== 'guest'
      || !persistedSessionsHydrated
      || !isComposingNewSession
      || persistedSessions.length === 0
    ) {
      return;
    }
    openSessionSummary(persistedSessions[0].id);
  }, [
    authStatus,
    isComposingNewSession,
    openSessionSummary,
    persistedSessions,
    persistedSessionsHydrated,
  ]);

  const authFlow = useAppAuthFlow({
    authStatus,
    currentUser,
    sessionUserId,
    queryClient,
    completeLogin,
    continueAsGuest,
    logoutCurrentSession,
    retryAuthenticationRequiredResponse,
    showToast,
  });

  const devProfileSwitcherSlot = import.meta.env.DEV ? (
    <DevProfileSwitcher
      currentUserId={sessionUserId}
      onSwitchProfile={authFlow.handleSwitchDevProfile}
    />
  ) : null;

  // When set, the library picker filters out artworks already in this ongoing
  // session; picks stage into the shared tray either way.
  const [libraryPickerSessionId, setLibraryPickerSessionId] = React.useState<string | null>(null);

  // Staged artworks go to the tray in the composer (new session) and the action
  // bar (ongoing session), so both surfaces can add a message before sending.
  const canStageSessionArtworks = isComposingNewSession || Boolean(activeSessionSummary);

  const openSessionLibraryPicker = React.useCallback(() => {
    if (!activeSessionSummary) return;
    if (!canSearchCollection) {
      authFlow.requestLogin();
      return;
    }
    setLibraryPickerSessionId(activeSessionSummary.id);
    setIsLibraryPickerOpen(true);
  }, [activeSessionSummary, canSearchCollection, setIsLibraryPickerOpen]);

  const setAuthorizedLibraryPickerOpen: React.Dispatch<React.SetStateAction<boolean>> = (nextOpen) => {
    if (nextOpen === true && !canSearchCollection) {
      authFlow.requestLogin();
      return;
    }
    setIsLibraryPickerOpen(nextOpen);
  };

  // A staged batch belongs to the surface it was composed on; switching
  // sessions (or entering/leaving the composer) discards it.
  const activeSessionIdForStaging = activeSessionSummary?.id ?? null;
  React.useEffect(() => {
    resetPreparedSessionState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionIdForStaging]);

  const removeArtworkLocally = React.useCallback((itemId: string) => {
    removeArtwork(itemId);
    setArtworkWorkspace((prev) => ({
      ...prev,
      itemIds: prev.itemIds.filter((id) => id !== itemId),
    }));
    setArtworkDetailSelection((prev) => (prev?.artworkClientId === itemId ? null : prev));
  }, [removeArtwork, setArtworkDetailSelection, setArtworkWorkspace]);

  const clearArtworkDetailSelection = React.useCallback((itemId: string) => {
    setArtworkDetailSelection((prev) => (prev?.artworkClientId === itemId ? null : prev));
  }, [setArtworkDetailSelection]);

  const dismissDeleteConfirmation = React.useCallback(() => {
    setDeleteConfirmation(null);
  }, []);

  const artworkDeletion = useArtworkDeletion({
    userId: sessionUserId,
    items,
    queryClient,
    patchArtwork,
    removeArtworkLocally,
    clearArtworkDetailSelection,
    refreshArtworks,
    refreshProfileDerivedData,
    requestConfirmation: setDeleteConfirmation,
    dismissConfirmation: dismissDeleteConfirmation,
    showToast,
  });

  const {
    updateSavedArtworkInState,
    applyArtworkAnalysisResult,
    markArtworkAnalysisFailed,
    handleFileUpload,
    prepareCaptureSubmission,
    ingestPreparedUploads,
  } = useArtworkUploadOperations({
    userId: sessionUserId,
    activeTab,
    canStageSessionArtworks,
    pendingSessionArtworks,
    setPendingSessionArtworks,
    patchArtwork,
    addLocalArtworks,
    replaceArtwork,
    removeArtwork,
    artworkDetailSelection,
    setArtworkDetailSelection,
    setTagPositions,
    setIsAnalyzing,
    showToast,
    parseAnalysis,
  });
  const persistedSessionIds = React.useMemo(
    () => persistedSessions.map((session) => session.id),
    [persistedSessions],
  );
  const sessionTitleById = React.useMemo(
    () => Object.fromEntries(sessionSummaries.map((session) => [session.id, session.title])),
    [sessionSummaries],
  );
  const {
    isSubmittingStagedBatch,
    activeInputPipelineSessionId,
    submitPreparedSession,
    submitStagedBatch,
    submitImmediateArtwork,
  } = useSessionArtworkInputPipeline({
    userId: sessionUserId,
    defaultSessionTitle: DEFAULT_VISIT_TITLE,
    items,
    persistedSessionIds,
    sessionTitleById,
    sessionStreams,
    pendingSessionArtworks,
    newSessionDraftMessage,
    isSubmittingPreparedSession,
    setIsSubmittingPreparedSession,
    refreshPersistedSessions,
    setSessionDrafts,
    resetPreparedSessionState,
    updateArtworkSessionLinks,
    setActiveTab,
    setFilteredSessionId,
    setIsComposingNewSession,
    setSessionStreams,
    appendSessionEvents,
    persistSessionArtworkInput,
    sendSessionInquiryToSession,
    ingestPreparedUploads,
    setVisit: setArtworkWorkspace,
    showToast,
    onAuthenticationRequired: authFlow.requestLogin,
  });

  const handleSessionCaptureSubmit = React.useCallback(async (payload: {
    artwork: File;
    label: File | null;
    coords?: {
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
      positionTimestamp?: number;
      source?: 'device_live' | 'image_exif';
    };
  }) => {
    const preparedCapture = await prepareCaptureSubmission(payload);
    if (!preparedCapture) return;
    exitCaptureAfterSubmit();
    await submitImmediateArtwork(preparedCapture, activeSessionSummary?.id);
  }, [
    activeSessionSummary?.id,
    exitCaptureAfterSubmit,
    prepareCaptureSubmission,
    submitImmediateArtwork,
  ]);

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
    canAccessTab: (tab) => (
      (tab !== 'collect' || canSearchCollection)
      && (tab !== 'profile' || canViewProfile)
    ),
    onRestrictedTab: authFlow.requestLogin,
  });
  const artworkHeaderActions = artworkDetailItem?.artworkId ? (
    <ArtworkActionsMenu
      disabled={Boolean(artworkDetailItem.isAnalyzing || artworkDetailItem.deleteStatus === 'pending')}
      onEdit={!artworkDetailItem.isAnalyzing && artworkDetailItem.deleteStatus !== 'pending' ? () => setArtworkHeaderEditToken(token => token + 1) : undefined}
      onIdentifyAgain={!artworkDetailItem.isAnalyzing && artworkDetailItem.deleteStatus !== 'pending' ? openHeaderIdentifyAgainModal : undefined}
      onDelete={artworkDetailItem.deleteStatus !== 'pending' ? () => artworkDeletion.requestDeleteItem(artworkDetailItem.id) : undefined}
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
      {(currentUser?.username || currentUser?.full_name || currentUser?.email || 'U')[0].toUpperCase()}
    </div>
  );

  const viewportShell = {
    activeTab,
    collectTab,
    learningInitialGuide,
    userId: sessionUserId,
    headerMenuButton,
    collectionFloatingMenuButton,
    profileRefreshKey,
    interactionGate: authStatus === 'guest' ? guestExperience.interactionGate : undefined,
    artworkInputLimit: authStatus === 'guest' ? guestExperience.artworkRemaining : undefined,
    onSignIn: authFlow.requestLogin,
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
    setSessionGoalInput,
    onSaveSessionGoal: patchSessionGoal,
    setNewSessionDraftMessage,
    setIsLibraryPickerOpen: setAuthorizedLibraryPickerOpen,
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
    handleDeleteItem: artworkDeletion.requestDeleteItem,
    handleDeleteItems: artworkDeletion.requestDeleteItems,
    setIsUnsortedFlowOpen,
    handleToggleLike,
    handleSessionInquiry,
    onSessionAuthenticationRequired: authFlow.handleAuthenticationRequired,
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
          initialSelectedIds={pendingLibraryArtworkIds}
          maxSelection={Math.max(
            1,
            MAX_SESSION_ARTWORK_BATCH_SIZE - pendingSessionArtworks.filter((entry) => entry.kind !== 'library').length,
          )}
          currentSessionId={libraryPickerSessionId}
          searchValue={libraryPickerSearch}
          onRefresh={refreshArtworksIfStale}
          onClose={() => {
            setIsLibraryPickerOpen(false);
            setLibraryPickerSearch('');
            setLibraryPickerSessionId(null);
          }}
          onSearchChange={setLibraryPickerSearch}
          onConfirm={(selectedItems) => {
            commitLibrarySelection(selectedItems);
            setIsLibraryPickerOpen(false);
            setLibraryPickerSearch('');
            setLibraryPickerSessionId(null);
          }}
        />

        <LoginModal
          open={authFlow.loginModalOpen}
          onClose={authFlow.closeLogin}
          onLoginSuccess={(user) => {
            void authFlow.handleLoginSuccess(user);
          }}
          onLoginError={(error) => {
            console.error('Google sign-in diagnostic:', {
              code: error.code,
              status: error.status,
              detail: error.detail,
            });
            showToast(error.message, 'info');
          }}
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
          onLogout={authFlow.handleLogout}
        />

        {!sessionCaptureState && (
          authStatus === 'guest' ? (
            <GuestSidebar
              sidebarOpen={sidebarOpen}
              sidebarCollapsed={sidebarCollapsed}
              experience={guestExperience}
              currentSession={sessionSummaries[0] ?? null}
              sessionsLoading={sessionsLoading}
              onSelectCurrentSession={handleSelectSessionSummary}
              onSignIn={authFlow.requestLogin}
              onExpandSidebar={expandSidebar}
              onCollapseSidebar={collapseSidebar}
              onCloseMobileSidebar={closeMobileSidebar}
            />
          ) : (
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
            currentUsername={currentUser?.username || currentUser?.full_name || currentUser?.email?.split('@')[0]}
            isAuthenticated={Boolean(currentUser)}
            accountUsageSlot={<AccountUsageMeter userId={sessionUserId} />}
            devProfileSwitcherSlot={devProfileSwitcherSlot}
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
            onSignIn={authFlow.requestLogin}
            onSignOut={authFlow.handleLogout}
            onExpandSidebar={expandSidebar}
            onCollapseSidebar={collapseSidebar}
            onCloseMobileSidebar={closeMobileSidebar}
            />
          )
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
          onCloseDeleteConfirmation={dismissDeleteConfirmation}
          onConfirmDeleteItem={artworkDeletion.confirmDeleteItem}
          onConfirmDeleteItems={artworkDeletion.confirmDeleteItems}
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
