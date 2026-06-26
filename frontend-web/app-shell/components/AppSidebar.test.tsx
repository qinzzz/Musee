import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AppSidebar from './AppSidebar';
import type { SessionSummary } from '../../session/types';

function createSessionSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 'visit-1',
    title: 'Untitled Session',
    titlePending: false,
    location: null,
    artworkCount: 1,
    updatedAt: Date.now(),
    dateLabel: null,
    items: [],
    ...overrides,
  };
}

function renderSidebar(sessionSummary: SessionSummary) {
  render(
    <AppSidebar
      sidebarOpen
      sidebarCollapsed={false}
      recentsOpen={false}
      userMenuOpen={false}
      sessionSearch=""
      language="en"
      sessionsLoading={false}
      recentSessionSummaries={[sessionSummary]}
      sessionSummaries={[sessionSummary]}
      activeSessionSummaryId={null}
      isNewSessionEntryActive={false}
      editingSessionId={null}
      editingSessionTitle=""
      openSessionMenuId={null}
      pendingDeletedSessionIds={new Set()}
      currentUsername="User"
      isAuthenticated={false}
      userAvatar={<div>U</div>}
      renameInputRef={{ current: null }}
      navigationItems={[]}
      onRecentsOpenChange={vi.fn()}
      onUserMenuOpenChange={vi.fn()}
      onSessionSearchChange={vi.fn()}
      onEditingSessionTitleChange={vi.fn()}
      onCommitSessionRename={vi.fn(async () => {})}
      onCancelSessionRename={vi.fn()}
      onOpenSessionMenuChange={vi.fn()}
      onSelectSessionSummary={vi.fn()}
      onStartRenameSession={vi.fn()}
      onDeleteSession={vi.fn()}
      onLanguageChange={vi.fn()}
      onOpenSettings={vi.fn()}
      onSignIn={vi.fn()}
      onSignOut={vi.fn()}
      onExpandSidebar={vi.fn()}
      onCollapseSidebar={vi.fn()}
      onCloseMobileSidebar={vi.fn()}
    />,
  );
}

describe('AppSidebar session title loading', () => {
  it('renders a title skeleton instead of Untitled Session while a summary title is pending', () => {
    renderSidebar(createSessionSummary({ titlePending: true }));

    expect(screen.getByTestId('visit-title-skeleton-visit-1')).toBeTruthy();
    expect(screen.queryByText('Untitled Session')).toBeNull();
  });

  it('renders the resolved session title when the title is no longer pending', () => {
    renderSidebar(createSessionSummary({ title: 'New York', titlePending: false }));

    expect(screen.queryByTestId('visit-title-skeleton-visit-1')).toBeNull();
    expect(screen.getByText('New York')).toBeTruthy();
  });
});
