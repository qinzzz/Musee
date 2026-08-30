import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AppSidebarContainer from './AppSidebarContainer';

vi.mock('../../guest/GuestSidebar', () => ({
  default: ({ currentSession }: { currentSession: { id: string } | null }) => (
    <div>guest-sidebar:{currentSession?.id ?? 'none'}</div>
  ),
}));

vi.mock('./AppSidebar', () => ({
  default: ({
    currentUsername,
    onLanguageChange,
  }: {
    currentUsername?: string | null;
    onLanguageChange: (language: string) => void;
  }) => (
    <div>
      <span>authenticated-sidebar:{currentUsername}</span>
      <button onClick={() => onLanguageChange('fr')}>change-language</button>
    </div>
  ),
}));

vi.mock('./AccountUsageMeter', () => ({
  default: () => <div>usage-meter</div>,
}));

const sessionSummary = {
  id: 'session-1',
  title: 'Session',
  location: null,
  artworkCount: 0,
  updatedAt: 1,
  dateLabel: null,
  items: [],
};

function renderSidebar(isGuest: boolean) {
  const onLanguageChange = vi.fn();
  const workspace = {
    sessionState: {
      sessionSearch: '',
      setSessionSearch: vi.fn(),
      openSessionMenuId: null,
      setOpenSessionMenuId: vi.fn(),
      editingSessionId: null,
      setEditingSessionId: vi.fn(),
      editingSessionTitle: '',
      setEditingSessionTitle: vi.fn(),
      sessionSummaries: [sessionSummary],
      activeSessionSummary: sessionSummary,
    },
    sessionActions: {
      handleDeleteSession: vi.fn(),
      handleStartRenameSession: vi.fn(),
      commitSessionRename: vi.fn(),
    },
    pendingDeletedSessionIds: new Set<string>(),
    recentSessionSummaries: [sessionSummary],
    sessionsLoading: false,
  };
  const navigation = {
    sidebarOpen: true,
    sidebarCollapsed: false,
    recentsOpen: false,
    setRecentsOpen: vi.fn(),
    userMenuOpen: false,
    setUserMenuOpen: vi.fn(),
    isNewSessionEntryActive: true,
    navigationItems: [],
    handleSelectSessionSummary: vi.fn(),
    closeMobileSidebar: vi.fn(),
    expandSidebar: vi.fn(),
    collapseSidebar: vi.fn(),
  };

  render(
    <AppSidebarContainer
      isGuest={isGuest}
      experience={{} as never}
      workspace={workspace as never}
      navigation={navigation as never}
      language="en"
      userId="user-1"
      currentUsername="Ada"
      isAuthenticated
      userAvatar={null}
      renameInputRef={{ current: null }}
      onLanguageChange={onLanguageChange}
      onOpenSettings={vi.fn()}
      onSignIn={vi.fn()}
      onSignOut={vi.fn()}
    />,
  );

  return { onLanguageChange };
}

describe('AppSidebarContainer', () => {
  it('uses the current preview session in the guest sidebar', () => {
    renderSidebar(true);

    expect(screen.getByText('guest-sidebar:session-1')).toBeTruthy();
    expect(screen.queryByText(/authenticated-sidebar/)).toBeNull();
  });

  it('renders the authenticated sidebar and forwards preferences', () => {
    const { onLanguageChange } = renderSidebar(false);

    expect(screen.getByText('authenticated-sidebar:Ada')).toBeTruthy();
    fireEvent.click(screen.getByText('change-language'));
    expect(onLanguageChange).toHaveBeenCalledWith('fr');
  });
});
