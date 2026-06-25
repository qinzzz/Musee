import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AppSidebar from './AppSidebar';
import type { VisitSummary } from '../../session/types';

function createVisitSummary(overrides: Partial<VisitSummary> = {}): VisitSummary {
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

function renderSidebar(visitSummary: VisitSummary) {
  render(
    <AppSidebar
      sidebarOpen
      sidebarCollapsed={false}
      recentsOpen={false}
      userMenuOpen={false}
      visitSearch=""
      language="en"
      sessionsLoading={false}
      recentVisitSummaries={[visitSummary]}
      visitSummaries={[visitSummary]}
      activeVisitSummaryId={null}
      isNewSessionEntryActive={false}
      editingVisitId={null}
      editingVisitTitle=""
      openVisitMenuId={null}
      pendingDeletedSessionIds={new Set()}
      currentUsername="User"
      isAuthenticated={false}
      userAvatar={<div>U</div>}
      renameInputRef={{ current: null }}
      navigationItems={[]}
      onRecentsOpenChange={vi.fn()}
      onUserMenuOpenChange={vi.fn()}
      onVisitSearchChange={vi.fn()}
      onEditingVisitTitleChange={vi.fn()}
      onCommitVisitRename={vi.fn(async () => {})}
      onCancelVisitRename={vi.fn()}
      onOpenVisitMenuChange={vi.fn()}
      onSelectVisitSummary={vi.fn()}
      onStartRenameVisit={vi.fn()}
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
    renderSidebar(createVisitSummary({ titlePending: true }));

    expect(screen.getByTestId('visit-title-skeleton-visit-1')).toBeTruthy();
    expect(screen.queryByText('Untitled Session')).toBeNull();
  });

  it('renders the resolved session title when the title is no longer pending', () => {
    renderSidebar(createVisitSummary({ title: 'New York', titlePending: false }));

    expect(screen.queryByTestId('visit-title-skeleton-visit-1')).toBeNull();
    expect(screen.getByText('New York')).toBeTruthy();
  });
});
