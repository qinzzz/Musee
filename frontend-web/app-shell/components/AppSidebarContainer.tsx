import React from 'react';
import type { GuestExperience } from '../../guest/guestExperience';
import GuestSidebar from '../../guest/GuestSidebar';
import type { useSessionWorkspace } from '../../session/hooks/useSessionWorkspace';
import type { useAppShellNavigation } from '../hooks/useAppShellNavigation';
import AccountUsageMeter from './AccountUsageMeter';
import AppSidebar from './AppSidebar';

type AppSidebarContainerProps = {
  isGuest: boolean;
  experience: GuestExperience;
  workspace: ReturnType<typeof useSessionWorkspace>;
  navigation: ReturnType<typeof useAppShellNavigation>;
  language: string;
  userId: string;
  currentUsername?: string | null;
  isAuthenticated: boolean;
  userAvatar: React.ReactNode;
  devProfileSwitcherSlot?: React.ReactNode;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  onLanguageChange: (language: string) => void;
  onOpenSettings: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
};

export default function AppSidebarContainer({
  isGuest,
  experience,
  workspace,
  navigation,
  language,
  userId,
  currentUsername,
  isAuthenticated,
  userAvatar,
  devProfileSwitcherSlot,
  renameInputRef,
  onLanguageChange,
  onOpenSettings,
  onSignIn,
  onSignOut,
}: AppSidebarContainerProps) {
  const {
    sessionState: {
      sessionSearch,
      setSessionSearch,
      openSessionMenuId,
      setOpenSessionMenuId,
      editingSessionId,
      setEditingSessionId,
      editingSessionTitle,
      setEditingSessionTitle,
      sessionSummaries,
      activeSessionSummary,
    },
    sessionActions: {
      handleDeleteSession,
      handleStartRenameSession,
      commitSessionRename,
    },
    pendingDeletedSessionIds,
    recentSessionSummaries,
    sessionsLoading,
  } = workspace;
  const {
    sidebarOpen,
    sidebarCollapsed,
    recentsOpen,
    setRecentsOpen,
    userMenuOpen,
    setUserMenuOpen,
    isNewSessionEntryActive,
    navigationItems,
    handleSelectSessionSummary,
    closeMobileSidebar,
    expandSidebar,
    collapseSidebar,
  } = navigation;

  if (isGuest) {
    return (
      <GuestSidebar
        sidebarOpen={sidebarOpen}
        sidebarCollapsed={sidebarCollapsed}
        experience={experience}
        currentSession={sessionSummaries[0] ?? null}
        sessionsLoading={sessionsLoading}
        onSelectCurrentSession={handleSelectSessionSummary}
        onSignIn={onSignIn}
        onExpandSidebar={expandSidebar}
        onCollapseSidebar={collapseSidebar}
        onCloseMobileSidebar={closeMobileSidebar}
      />
    );
  }

  return (
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
      currentUsername={currentUsername}
      isAuthenticated={isAuthenticated}
      accountUsageSlot={<AccountUsageMeter userId={userId} />}
      devProfileSwitcherSlot={devProfileSwitcherSlot}
      userAvatar={userAvatar}
      renameInputRef={renameInputRef}
      navigationItems={navigationItems}
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
      onLanguageChange={onLanguageChange}
      onOpenSettings={onOpenSettings}
      onSignIn={onSignIn}
      onSignOut={onSignOut}
      onExpandSidebar={expandSidebar}
      onCollapseSidebar={collapseSidebar}
      onCloseMobileSidebar={closeMobileSidebar}
    />
  );
}
