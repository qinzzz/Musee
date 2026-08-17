import React from 'react';
import type { SessionSummary } from '../session/types';
import { formatSessionSummaryMeta } from '../session/lib/sessionSummaryPresentation';
import type { GuestExperience } from './guestExperience';

type GuestSidebarProps = {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  experience: GuestExperience;
  currentSession: SessionSummary | null;
  sessionsLoading: boolean;
  onSelectCurrentSession: (sessionId: string) => void;
  onSignIn: () => void;
  onExpandSidebar: () => void;
  onCollapseSidebar: () => void;
  onCloseMobileSidebar: () => void;
};

const PreviewIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const SignInIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" y1="12" x2="3" y2="12" />
  </svg>
);

export default function GuestSidebar({
  sidebarOpen,
  sidebarCollapsed,
  experience,
  currentSession,
  sessionsLoading,
  onSelectCurrentSession,
  onSignIn,
  onExpandSidebar,
  onCollapseSidebar,
  onCloseMobileSidebar,
}: GuestSidebarProps) {
  return (
    <>
      {sidebarCollapsed ? (
        <aside className="hidden w-[72px] shrink-0 flex-col border-r border-neutral-200 bg-[var(--color-bg-secondary)] md:flex">
          <div className="flex h-[52px] items-center justify-center border-b border-neutral-200 px-3">
            <button
              type="button"
              onClick={onExpandSidebar}
              className="flex h-10 w-10 items-center justify-center rounded-2xl text-[20px] font-bold text-neutral-800 transition-colors hover:bg-white"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              M
            </button>
          </div>
          {currentSession ? (
            <div className="px-3 py-4">
              <button
                type="button"
                onClick={() => onSelectCurrentSession(currentSession.id)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-bg-tertiary)] text-neutral-700 ring-1 ring-neutral-200"
                aria-label="Open your preview session"
                title="Your preview session"
              >
                <PreviewIcon />
              </button>
            </div>
          ) : null}
          <div className="mt-auto p-3">
            <button
              type="button"
              onClick={onSignIn}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-800 shadow-sm transition-colors hover:bg-neutral-50"
              aria-label={experience.signInLabel}
              title={experience.signInLabel}
            >
              <SignInIcon />
            </button>
          </div>
        </aside>
      ) : null}

      <aside
        data-testid="guest-sidebar"
        className={`z-[var(--z-drawer)] flex h-full w-[260px] shrink-0 flex-col overflow-hidden border-r border-neutral-200 bg-[var(--color-bg-secondary)] transition-all duration-300 md:z-auto ${
          sidebarOpen
            ? 'fixed inset-y-0 left-0 translate-x-0 shadow-[0_18px_60px_rgba(0,0,0,0.12)] md:relative md:inset-auto md:shadow-none'
            : 'fixed inset-y-0 left-0 -translate-x-full md:relative md:inset-auto md:translate-x-0'
        } ${sidebarCollapsed ? 'md:hidden' : ''}`}
      >
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-neutral-200 px-5">
          <h1 className="text-[14px] font-bold tracking-[0.04em] text-neutral-800">Musee</h1>
          <button
            type="button"
            onClick={onCollapseSidebar}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 transition-colors hover:text-neutral-900"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <path d="M16 15l-3-3 3-3" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto px-4 py-5">
          <div className="rounded-[22px] border border-neutral-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-400">Guest preview</p>
            <h2 className="mt-2 text-[17px] font-semibold leading-tight text-neutral-900">{experience.sidebarTitle}</h2>
            <p className="mt-2 text-[13px] leading-5 text-neutral-500">{experience.sidebarMessage}</p>
          </div>

          <div className="mt-5">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400">Current session</p>
            {sessionsLoading ? (
              <div className="mt-2 animate-pulse rounded-[20px] border border-neutral-200 bg-white px-4 py-4">
                <div className="h-4 w-28 rounded-full bg-neutral-200" />
                <div className="mt-2 h-3 w-16 rounded-full bg-neutral-100" />
              </div>
            ) : currentSession ? (
              <button
                type="button"
                onClick={() => onSelectCurrentSession(currentSession.id)}
                className="mt-2 w-full rounded-[20px] border border-neutral-200 bg-[var(--color-bg-tertiary)] px-4 py-3 text-left text-neutral-800 shadow-sm transition-colors hover:bg-neutral-100"
              >
                <p className="truncate text-[14px] font-semibold">{currentSession.title}</p>
                <p className="mt-1 truncate text-[12px] text-neutral-500">{formatSessionSummaryMeta(currentSession)}</p>
              </button>
            ) : (
              <p className="mt-2 rounded-[20px] border border-dashed border-neutral-200 px-4 py-4 text-[13px] leading-5 text-neutral-500">
                Your first question will create the preview session.
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-neutral-200 p-4">
          <button
            type="button"
            onClick={onSignIn}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-neutral-900 px-4 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-neutral-800"
          >
            <SignInIcon />
            {experience.signInLabel}
          </button>
          <p className="mt-2 text-center text-[11px] leading-4 text-neutral-400">Keep this session and unlock your collection.</p>
        </div>
      </aside>

      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-[var(--z-drawer-backdrop)] bg-neutral-900/20 backdrop-blur-[1px] md:hidden"
          onClick={onCloseMobileSidebar}
        />
      ) : null}
    </>
  );
}
