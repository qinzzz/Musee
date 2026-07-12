import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import type { SessionSummary } from '../../session/types';

export type AppSidebarNavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onSelect: () => void;
};

type Props = {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  recentsOpen: boolean;
  userMenuOpen: boolean;
  sessionSearch: string;
  language: string;
  sessionsLoading: boolean;
  recentSessionSummaries: SessionSummary[];
  sessionSummaries: SessionSummary[];
  activeSessionSummaryId?: string | null;
  isNewSessionEntryActive: boolean;
  editingSessionId: string | null;
  editingSessionTitle: string;
  openSessionMenuId: string | null;
  pendingDeletedSessionIds: Set<string>;
  currentUsername?: string | null;
  isAuthenticated: boolean;
  userAvatar: React.ReactNode;
  accountUsageSlot?: React.ReactNode;
  devProfileSwitcherSlot?: React.ReactNode;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  navigationItems: AppSidebarNavItem[];
  onRecentsOpenChange: (open: boolean) => void;
  onUserMenuOpenChange: (open: boolean) => void;
  onSessionSearchChange: (value: string) => void;
  onEditingSessionTitleChange: (value: string) => void;
  onCommitSessionRename: (summaryId: string) => Promise<void>;
  onCancelSessionRename: () => void;
  onOpenSessionMenuChange: (summaryId: string, open: boolean) => void;
  onSelectSessionSummary: (summaryId: string) => void;
  onStartRenameSession: (summaryId: string, title: string) => void;
  onDeleteSession: (summaryId: string) => void;
  onLanguageChange: (language: string) => void;
  onOpenSettings: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onExpandSidebar: () => void;
  onCollapseSidebar: () => void;
  onCloseMobileSidebar: () => void;
};

const SessionListSkeleton: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div className={`space-y-2 ${compact ? 'px-1 pb-1' : ''}`}>
    {Array.from({ length: compact ? 4 : 6 }).map((_, index) => (
      <div
        key={index}
        className={`animate-pulse rounded-[22px] border border-neutral-200/70 bg-white/70 ${compact ? 'px-3 py-3' : 'px-4 py-3'}`}
      >
        <div className="h-4 w-32 rounded-full bg-neutral-200/80" />
        <div className="mt-2 h-3 w-20 rounded-full bg-neutral-100" />
      </div>
    ))}
  </div>
);

const SessionTitleSkeleton: React.FC<{ summaryId: string }> = ({ summaryId }) => (
  <div
    data-testid={`session-title-skeleton-${summaryId}`}
    className="h-4 w-28 animate-pulse rounded-full bg-neutral-200/80"
  />
);

const sidebarNavItemSharedClassName =
  'h-11 rounded-2xl ring-1 ring-transparent transition-colors';
const sidebarNavItemActiveClassName =
  'bg-[var(--color-bg-tertiary)] text-neutral-900 shadow-sm ring-neutral-200';
const sidebarNavItemInactiveClassName =
  'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900';

const getExpandedNavItemClassName = (isActive: boolean) =>
  `w-full flex items-center gap-3.5 px-3 text-[13px] font-medium text-left ${sidebarNavItemSharedClassName} ${
    isActive ? sidebarNavItemActiveClassName : sidebarNavItemInactiveClassName
  }`;

const getCollapsedNavItemClassName = (isActive: boolean) =>
  `flex h-11 w-11 items-center justify-center ${sidebarNavItemSharedClassName} ${
    isActive ? sidebarNavItemActiveClassName : sidebarNavItemInactiveClassName
  }`;

const AppSidebar: React.FC<Props> = ({
  sidebarOpen,
  sidebarCollapsed,
  recentsOpen,
  userMenuOpen,
  sessionSearch,
  language,
  sessionsLoading,
  recentSessionSummaries,
  sessionSummaries,
  activeSessionSummaryId,
  isNewSessionEntryActive,
  editingSessionId,
  editingSessionTitle,
  openSessionMenuId,
  pendingDeletedSessionIds,
  currentUsername,
  isAuthenticated,
  userAvatar,
  accountUsageSlot,
  devProfileSwitcherSlot,
  renameInputRef,
  navigationItems,
  onRecentsOpenChange,
  onUserMenuOpenChange,
  onSessionSearchChange,
  onEditingSessionTitleChange,
  onCommitSessionRename,
  onCancelSessionRename,
  onOpenSessionMenuChange,
  onSelectSessionSummary,
  onStartRenameSession,
  onDeleteSession,
  onLanguageChange,
  onOpenSettings,
  onSignIn,
  onSignOut,
  onExpandSidebar,
  onCollapseSidebar,
  onCloseMobileSidebar,
}) => {
  const renderSessionSummaryCard = (summary: SessionSummary) => {
    const isPendingDelete = pendingDeletedSessionIds.has(summary.id);
    const isActive = activeSessionSummaryId === summary.id && isNewSessionEntryActive;

    return (
      <div
        key={summary.id}
        className={`relative w-full rounded-[20px] p-1 transition-opacity ${
          isActive
            ? 'bg-[var(--color-bg-tertiary)] text-neutral-900 shadow-sm ring-1 ring-neutral-200'
            : 'text-neutral-600 hover:bg-neutral-100/80 hover:text-neutral-900 font-medium'
        } ${isPendingDelete ? 'cursor-default opacity-45' : ''}`}
      >
        <button
          onClick={() => {
            if (isPendingDelete) return;
            onSelectSessionSummary(summary.id);
          }}
          className="w-full rounded-[16px] px-4 py-2 pr-12 text-left"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            {editingSessionId === summary.id ? (
              <input
                ref={renameInputRef}
                value={editingSessionTitle}
                onChange={(event) => onEditingSessionTitleChange(event.target.value)}
                onBlur={() => void onCommitSessionRename(summary.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void onCommitSessionRename(summary.id);
                  }
                  if (event.key === 'Escape') {
                    onCancelSessionRename();
                  }
                }}
                onClick={(event) => event.stopPropagation()}
                className="w-full rounded-md bg-white/90 px-2 py-1 text-[13px] leading-tight text-neutral-900 outline-none ring-1 ring-neutral-200 focus:ring-2 focus:ring-neutral-400"
              />
            ) : (
              summary.titlePending ? (
                <SessionTitleSkeleton summaryId={summary.id} />
              ) : (
                <p className="truncate text-[13px] leading-tight">{summary.title}</p>
              )
            )}
            <p
              className={`mt-1 truncate font-mono text-[10px] font-semibold leading-none tracking-wide ${
                isActive ? 'text-neutral-500' : 'text-neutral-400/90'
              }`}
            >
              {summary.artworkCount} {summary.artworkCount === 1 ? 'artwork' : 'artworks'}
            </p>
          </div>
        </button>
        {editingSessionId !== summary.id && !isPendingDelete && (
          <DropdownMenu
            open={openSessionMenuId === summary.id}
            onOpenChange={(open) => onOpenSessionMenuChange(summary.id, open)}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                className={`absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full transition-colors ${
                  isActive
                    ? 'text-neutral-500 hover:bg-white hover:text-neutral-900'
                    : 'text-neutral-400 hover:bg-white/80 hover:text-neutral-700'
                }`}
                aria-label={`Open actions for ${summary.title}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="1.7" />
                  <circle cx="12" cy="12" r="1.7" />
                  <circle cx="19" cy="12" r="1.7" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              sideOffset={6}
              className="min-w-[170px]"
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              <DropdownMenuItem
                className="gap-2 font-medium"
                onSelect={() => onStartRenameSession(summary.id, summary.title)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                <span>Rename session</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                destructive
                className="gap-2 font-medium"
                onSelect={() => onDeleteSession(summary.id)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>Delete session</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  };

  const userLabel = currentUsername || 'User';

  return (
    <>
      {sidebarCollapsed && (
        <aside className="hidden md:flex md:w-[72px] shrink-0 flex-col border-r border-neutral-200 bg-[var(--color-bg-secondary)]">
          <div className="flex h-[52px] flex-col items-center border-b border-neutral-200 px-3">
            <button
              onClick={onExpandSidebar}
              className="group relative flex h-full w-full items-center justify-center overflow-hidden rounded-[16px] border border-transparent text-neutral-800 transition-colors hover:bg-neutral-50"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <span className="text-[24px] font-bold tracking-[0.22em] transition-all duration-200 group-hover:translate-y-2 group-hover:opacity-0">
                M
              </span>
              <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-200 group-hover:opacity-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                  <path d="M13 9l3 3-3 3" />
                </svg>
              </span>
            </button>
          </div>

          <div className="flex flex-col items-center gap-2 px-3 py-4">
            {navigationItems.map((item) => (
              <button
                key={item.id}
                onClick={item.onSelect}
                className={getCollapsedNavItemClassName(item.isActive)}
                title={item.label}
                aria-label={item.label}
              >
                {item.icon}
              </button>
            ))}

            <DropdownMenu open={recentsOpen} onOpenChange={onRecentsOpenChange}>
              <DropdownMenuTrigger asChild>
                <button
                  className={getCollapsedNavItemClassName(recentsOpen)}
                  title="Recent sessions"
                  aria-label="Recent sessions"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="right"
                align="start"
                sideOffset={12}
                className="w-[340px] overflow-visible rounded-[24px] p-2"
              >
                <div className="px-3 py-2">
                  <p className="text-[16px] font-semibold text-neutral-900">Recents</p>
                </div>
                <div className="max-h-[min(70vh,560px)] space-y-2 overflow-y-auto px-1 pb-1">
                  {sessionsLoading ? (
                    <SessionListSkeleton compact={true} />
                  ) : recentSessionSummaries.length > 0 ? (
                    recentSessionSummaries.map((summary) => renderSessionSummaryCard(summary))
                  ) : (
                    <div className="px-3 py-4 text-[12px] text-neutral-400">No recent sessions yet.</div>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="mt-auto p-3 relative">
            <button
              onClick={() => onUserMenuOpenChange(!userMenuOpen)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white text-[12px] font-bold text-neutral-900 shadow-sm transition-colors hover:bg-neutral-50"
            >
              {userAvatar}
            </button>

            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-[var(--z-floating-backdrop)]" onClick={() => onUserMenuOpenChange(false)} />
                <div className="absolute bottom-3 left-full z-[var(--z-floating)] ml-3 w-[240px] rounded-2xl border border-neutral-200 bg-white p-4 shadow-xl">
                  {accountUsageSlot}
                  {devProfileSwitcherSlot}
                  <div>
                    <label className="text-[10px] font-medium text-neutral-400">Language</label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="mt-1.5 flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-xs text-neutral-700 transition-colors hover:border-neutral-300">
                          <span>{language === 'zh' ? '中文' : 'English'}</span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mr-0.5 text-neutral-400">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-0">
                        <DropdownMenuRadioGroup
                          value={language}
                          onValueChange={(nextLanguage) => {
                            onLanguageChange(nextLanguage);
                            onUserMenuOpenChange(false);
                          }}
                        >
                          <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="zh">中文</DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="mt-4 space-y-2">
                    {isAuthenticated && (
                      <button
                        onClick={() => {
                          onUserMenuOpenChange(false);
                          onOpenSettings();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-neutral-700 transition-all hover:bg-neutral-50"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                        </svg>
                        <span>Settings</span>
                      </button>
                    )}
                    {isAuthenticated ? (
                      <button
                        onClick={() => {
                          onUserMenuOpenChange(false);
                          onSignOut();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-500 transition-all hover:bg-red-50"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                        </svg>
                        <span>Sign out</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          onUserMenuOpenChange(false);
                          onSignIn();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold text-neutral-700 transition-all hover:bg-neutral-50"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
                        </svg>
                        <span>Sign in</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
      )}

      <aside
        className={`shrink-0 z-[var(--z-drawer)] md:z-auto overflow-hidden border-r border-neutral-200 bg-[var(--color-bg-secondary)] transition-all duration-300 flex flex-col h-full ${
          sidebarOpen
            ? 'fixed inset-y-0 left-0 w-[260px] translate-x-0 shadow-[0_18px_60px_rgba(0,0,0,0.12)] md:shadow-none md:relative md:inset-auto md:translate-x-0'
            : 'fixed inset-y-0 left-0 w-[260px] -translate-x-full md:translate-x-0 md:relative md:inset-auto'
        } ${sidebarCollapsed ? 'md:hidden' : 'md:w-[260px] md:opacity-100'}`}
      >
        <div className="flex h-[52px] items-center justify-between border-b border-neutral-200 px-5 shrink-0">
          <h1 className="text-[14px] font-bold tracking-[0.04em] text-neutral-800">Musee</h1>
          <button
            onClick={onCollapseSidebar}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 transition-colors hover:text-neutral-900"
            title="Collapse sidebar"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <path d="M16 15l-3-3 3-3" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-1 px-3 py-4 shrink-0">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              onClick={item.onSelect}
              className={getExpandedNavItemClassName(item.isActive)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="h-px bg-neutral-200/60 my-1 mx-4" />

        <div className="px-3 py-1.5 shrink-0">
          <div className="flex items-center gap-2.5 rounded-[16px] border border-neutral-200 bg-[var(--color-bg-tertiary)] px-3.5 py-2 text-neutral-700">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-neutral-400">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={sessionSearch}
              onChange={(event) => onSessionSearchChange(event.target.value)}
              placeholder="Search sessions"
              className="w-full bg-transparent text-[12px] placeholder-neutral-400 outline-none font-medium"
            />
          </div>
        </div>

        <div className="relative z-10 flex-1 overflow-y-auto px-3 py-3 min-h-0 space-y-2 scrollbar-thin">
          {sessionsLoading ? (
            <SessionListSkeleton />
          ) : (
            sessionSummaries.map((summary) => renderSessionSummaryCard(summary))
          )}
        </div>

        <div className="h-px bg-neutral-200/60 my-1 mx-4" />

        <div className={`relative shrink-0 p-3 ${userMenuOpen ? 'z-[var(--z-floating)]' : 'z-0'}`}>
          <button
            onClick={() => onUserMenuOpenChange(!userMenuOpen)}
            className="w-full flex items-center justify-between gap-3 pl-3.5 pr-4 py-2.5 rounded-xl border border-neutral-200 bg-white shadow-sm hover:bg-neutral-50 transition-colors text-left"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full border border-neutral-200 shadow-sm">
                {userAvatar}
              </div>
              <span className="text-[13px] font-semibold text-neutral-800 truncate">
                {userLabel}
              </span>
            </div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`text-neutral-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-[var(--z-floating-backdrop)]" onClick={() => onUserMenuOpenChange(false)} />
              <div className="absolute bottom-full left-3 right-3 mb-2 z-[var(--z-floating)] bg-white border border-neutral-200 rounded-2xl shadow-xl p-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                {accountUsageSlot}
                {devProfileSwitcherSlot}
                <div>
                  <label className="text-[10px] font-medium text-neutral-400">Language</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="mt-1.5 flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-left text-xs text-neutral-700 transition-colors hover:border-neutral-300">
                        <span>{language === 'zh' ? '中文' : 'English'}</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mr-0.5 text-neutral-400">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-0">
                      <DropdownMenuRadioGroup
                        value={language}
                        onValueChange={(nextLanguage) => {
                          onLanguageChange(nextLanguage);
                          onUserMenuOpenChange(false);
                        }}
                      >
                        <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="zh">中文</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {isAuthenticated && (
                  <button
                    onClick={() => {
                      onUserMenuOpenChange(false);
                      onOpenSettings();
                    }}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 rounded-xl transition-all"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                    </svg>
                    <span>Settings</span>
                  </button>
                )}

                {isAuthenticated ? (
                  <button
                    onClick={() => {
                      onUserMenuOpenChange(false);
                      onSignOut();
                    }}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    <span>Sign out</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      onUserMenuOpenChange(false);
                      onSignIn();
                    }}
                    className="w-full text-left flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 rounded-xl transition-all"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
                    </svg>
                    <span>Sign in</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </aside>

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-[var(--z-drawer-backdrop)] bg-neutral-900/20 backdrop-blur-[1px] md:hidden animate-in fade-in duration-300"
          onClick={onCloseMobileSidebar}
        />
      )}
    </>
  );
};

export default AppSidebar;
