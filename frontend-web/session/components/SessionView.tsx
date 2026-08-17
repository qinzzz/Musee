import React from 'react';
import { createPortal } from 'react-dom';
import CanvasHeader from '../../components/CanvasHeader';
import ArtworkDetailModal from '../../artwork/components/ArtworkDetailModal';
import type { ArtworkClassification, GalleryItem } from '../../types';
import type { ArtistPageContext, ArtworkDetailContext } from '../../lib/appNavigation';
import { SUPPORTED_UPLOAD_ACCEPT } from '../../lib/uploadValidation';
import {
  ARTWORK_CTA_ADD_FROM_COLLECTION,
  ARTWORK_CTA_SCAN_ARTWORK,
  ARTWORK_CTA_UPLOAD_PHOTOS,
} from '../../lib/artworkSourceCtas';
import {
  AddFromCollectionIcon,
  ScanArtworkIcon,
  UploadPhotosIcon,
} from '../../components/ArtworkSourceIcons';
import type { ArtworkDetailItem, IdentifyAgainHints } from '../../artwork/types';
import type { ActiveSessionStreamEntry, SessionRenderBlock, SessionSummary } from '../types';
import { SESSION_ARTWORK_QUESTION_PLACEHOLDER } from '../constants';
import SessionMessageMarkdown from './SessionMessageMarkdown';
import SessionArtworkCards from './SessionArtworkCards';
import SessionProcessingIndicator from './SessionProcessingIndicator';
import SessionThreadStatus from './SessionThreadStatus';
import {
  isPendingCommentaryStale,
  SESSION_PROCESSING_LABELS,
  type SessionProcessingState,
} from '../lib/sessionProcessingState';
import {
  getSessionComposerHeight,
  shouldSubmitSessionComposerOnEnter,
} from '../lib/sessionComposerBehavior';
import GuestInteractionPrompt from '../../guest/GuestInteractionPrompt';
import type { GuestInteractionGate } from '../../guest/guestExperience';

const MOBILE_COMPOSER_QUERY = '(max-width: 639px)';

const matchesMobileComposer = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia(MOBILE_COMPOSER_QUERY).matches
);

type SessionViewProps = {
  activeSessionSummary: SessionSummary;
  activeSessionStream: ActiveSessionStreamEntry[];
  sessionRenderBlocks: SessionRenderBlock[];
  artworkDetailItem: ArtworkDetailItem | null;
  artworkHeaderActions: React.ReactNode;
  artworkHeaderEditToken: number;
  artworkDetailContext: ArtworkDetailContext | null;
  headerLeftSlot?: React.ReactNode;
  showSessionHeader?: boolean;
  artworkDetailRightMode: 'metadata' | 'community';
  sessionGoalInput: string;
  sessionGoals: Record<string, string>;
  sessionGoalDismissed: Set<string>;
  streamingSessionResponse?: string;
  userId: string;
  sessionTitleById: Record<string, string>;
  goalGalleryInputRef: React.RefObject<HTMLInputElement | null>;
  preparedSessionItems: Array<{
    id: string;
    previewUrl: string;
    label: string;
    sublabel: string;
    kind: 'library' | 'upload';
  }>;
  preparedSessionMessage: string;
  isSubmittingPreparedSession: boolean;
  isSessionBusy: boolean;
  sessionProcessingState: SessionProcessingState;
  sessionHistoryStatus: 'loading' | 'ready' | 'error';
  sessionStreamScrollRef: React.RefObject<HTMLDivElement | null>;
  sessionStreamEndRef: React.RefObject<HTMLDivElement | null>;
  onCloseArtworkDetail: () => void;
  onUpdateMetadata: (itemId: string, fields: Partial<GalleryItem>) => void;
  onUpdateClassification: (itemId: string, classification: ArtworkClassification) => Promise<void>;
  onDeleteArtwork: (itemId: string) => void;
  onNavigateArtworkDetail: (direction: 'prev' | 'next') => void;
  onArtworkDetailRightModeChange: (mode: 'metadata' | 'community') => void;
  onIdentifyAgain: (hints?: IdentifyAgainHints) => Promise<void>;
  onRetryAnalysis: (item: GalleryItem) => Promise<void>;
  onOpenArtistFromInterpretation: (
    artistEntityId: string,
    artworkId: string,
    artistName?: string,
  ) => void;
  onOpenSessionFromInterpretation: (sessionId: string) => void;
  onSaveExistingGoal: (goal: string) => void;
  onSaveSessionTitle: (title: string) => Promise<void>;
  onSessionGoalInputChange: (value: string) => void;
  onSubmitGoal: (goal: string) => void;
  onOpenSessionCapture: () => void;
  onPreparedSessionMessageChange: (value: string) => void;
  onOpenLibraryPicker: () => void;
  onRemovePreparedSessionItem: (entryId: string) => void;
  onSubmitPreparedSession: () => void;
  onRetrySessionHistory: () => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>, mode: 'gallery' | 'camera') => void;
  onOpenSessionArtwork: (item: GalleryItem) => void;
  onAuthenticationRequired: (retry: {
    sessionId: string;
    responseId: string;
    message: string;
    parentEventId?: string;
    mode?: 'response_only' | 'append_message' | 'start_session';
    sessionTitle?: string;
  }) => void;
  interactionGate?: GuestInteractionGate;
  onSignIn?: () => void;
};

const SessionCommentaryBlock: React.FC<{
  entry: Extract<SessionRenderBlock, { type: 'commentary' }>;
  sessionProcessingState: SessionProcessingState;
  sessionId: string;
  onAuthenticationRequired: SessionViewProps['onAuthenticationRequired'];
}> = ({ entry, sessionProcessingState, sessionId, onAuthenticationRequired }) => {
  const retryMessage = entry.status === 'auth_required' && typeof entry.message.payload?.retry_message === 'string'
    ? entry.message.payload.retry_message
    : '';
  const retryMode = entry.message.payload?.retry_mode;
  const normalizedRetryMode = retryMode === 'append_message' || retryMode === 'start_session' || retryMode === 'response_only'
    ? retryMode
    : undefined;
  const sessionTitle = typeof entry.message.payload?.session_title === 'string'
    ? entry.message.payload.session_title
    : undefined;
  const isGuestLimit = entry.message.payload?.error_code === 'guest_quota_exhausted';
  const matchingState = 'responseId' in sessionProcessingState
    && sessionProcessingState.responseId === entry.id
    ? sessionProcessingState
    : null;
  const failedState: SessionProcessingState | null = entry.status === 'failed' || isPendingCommentaryStale(entry)
    ? {
        kind: 'failed',
        responseId: entry.id,
        message: SESSION_PROCESSING_LABELS.responseFailed,
      }
    : null;
  const effectiveState = matchingState || failedState;

  return (
    <div className="space-y-2 text-neutral-700">
      {entry.message.text ? (
        <div className="text-[16px] leading-[1.7]">
          <SessionMessageMarkdown>{entry.message.text}</SessionMessageMarkdown>
        </div>
      ) : null}
      {!entry.message.text && effectiveState?.kind === 'writing_response' ? (
        <SessionProcessingIndicator state={effectiveState} />
      ) : null}
      {effectiveState?.kind === 'failed' ? (
        <SessionProcessingIndicator state={effectiveState} />
      ) : null}
      {retryMessage ? (
        <button
          type="button"
          onClick={() => onAuthenticationRequired({
            sessionId,
            responseId: entry.id,
            message: retryMessage,
            parentEventId: entry.message.triggerEventId,
            mode: normalizedRetryMode,
            sessionTitle,
          })}
          className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 shadow-sm transition-colors hover:bg-neutral-50"
        >
          {isGuestLimit ? 'Sign in to continue' : 'Sign in and retry'}
        </button>
      ) : null}
    </div>
  );
};

const SessionDetailsModal: React.FC<{
  open: boolean;
  title: string;
  goal: string;
  items: GalleryItem[];
  onSaveTitle: (title: string) => Promise<void>;
  onSaveGoal: (goal: string) => void;
  onOpenArtwork: (item: GalleryItem) => void;
  onClose: () => void;
}> = ({ open, title, goal, items, onSaveTitle, onSaveGoal, onOpenArtwork, onClose }) => {
  const [titleDraft, setTitleDraft] = React.useState(title);
  const [goalDraft, setGoalDraft] = React.useState(goal);
  const [isSavingTitle, setIsSavingTitle] = React.useState(false);

  React.useEffect(() => {
    setTitleDraft(title);
  }, [title]);

  React.useEffect(() => {
    setGoalDraft(goal);
  }, [goal]);

  const commitTitle = async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === title) {
      setTitleDraft(title);
      return;
    }
    try {
      setIsSavingTitle(true);
      await onSaveTitle(trimmed);
    } finally {
      setIsSavingTitle(false);
    }
  };

  const commitGoal = () => {
    const trimmed = goalDraft.trim();
    if (!trimmed || trimmed === goal) {
      setGoalDraft(goal);
      return;
    }
    onSaveGoal(trimmed);
  };

  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/20 p-4 backdrop-blur-[2px] sm:p-6">
      <button
        type="button"
        aria-label="Close session details"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[84vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[24px] border border-neutral-200 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.12)]">
        <div className="flex items-center justify-between px-6 pb-4 pt-6">
          <h2 className="text-[18px] font-semibold tracking-tight text-neutral-900">Session details</h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 transition-colors hover:bg-neutral-100"
            aria-label="Close modal"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-6">
          <div>
            <p className="mb-2 text-[12px] font-medium text-neutral-500">Session name</p>
            <input
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void commitTitle();
                }
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  setTitleDraft(title);
                }
              }}
              disabled={isSavingTitle}
              className="w-full rounded-[16px] border border-neutral-200 bg-white px-4 py-3 text-[16px] text-neutral-800 outline-none transition-colors focus:border-neutral-300"
            />
          </div>
          <div>
            <p className="mb-2 text-[12px] font-medium text-neutral-500">Session goal</p>
            <textarea
              value={goalDraft}
              onChange={(event) => setGoalDraft(event.target.value)}
              onBlur={commitGoal}
              rows={3}
              placeholder="Add a focus for this session…"
              className="w-full resize-none rounded-[16px] border border-neutral-200 bg-white px-4 py-3 text-[16px] leading-relaxed text-neutral-800 outline-none transition-colors focus:border-neutral-300"
            />
          </div>
          {items.length > 0 ? (
            <div>
              <p className="mb-2 text-[12px] font-medium text-neutral-500">
                {items.length === 1 ? '1 artwork in this session' : `${items.length} artworks in this session`}
              </p>
              <div className="flex flex-wrap gap-2.5">
                {items.map((item) => (
                  <button
                    key={`session-details-${item.id}`}
                    onClick={() => {
                      if (item.isDeletedPlaceholder || item.deleteStatus === 'pending') return;
                      onClose();
                      onOpenArtwork(item);
                    }}
                    className={`shrink-0 overflow-hidden rounded-[18px] border border-neutral-200 bg-white shadow-sm transition-shadow ${
                      item.isDeletedPlaceholder || item.deleteStatus === 'pending'
                        ? 'cursor-default opacity-45'
                        : 'hover:shadow-md'
                    }`}
                    style={{ width: '96px', height: '96px' }}
                    aria-label={item.artworkName || 'Artwork'}
                  >
                    {item.isDeletedPlaceholder ? (
                      <div className="flex h-full w-full flex-col items-center justify-center bg-neutral-200 px-2 text-center text-neutral-600 grayscale">
                        <span className="line-clamp-3 text-[11px] font-semibold leading-tight">
                          {item.artworkName ? `${item.artworkName} (deleted)` : 'Deleted artwork'}
                        </span>
                        {item.artistName ? (
                          <span className="mt-1 line-clamp-2 text-[9px] leading-tight text-neutral-500">
                            {item.artistName}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <img
                        src={item.url}
                        alt={item.artworkName || 'Artwork'}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
};

const InsightPill: React.FC<{ title: string; text: string }> = ({ title, text }) => {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <button
      onClick={() => setExpanded((value) => !value)}
      className="w-full text-left rounded-[14px] bg-white px-3 py-2.5 shadow-sm hover:shadow-md transition-shadow"
    >
      <p className="text-[12px] font-semibold text-neutral-800 leading-snug">{title}</p>
      {expanded && <p className="text-[12px] text-neutral-600 leading-relaxed mt-1.5">{text}</p>}
    </button>
  );
};

export default function SessionView({
  activeSessionSummary,
  activeSessionStream,
  sessionRenderBlocks,
  artworkDetailItem,
  artworkHeaderActions,
  artworkHeaderEditToken,
  artworkDetailContext,
  headerLeftSlot,
  showSessionHeader = true,
  artworkDetailRightMode,
  sessionGoalInput,
  sessionGoals,
  sessionGoalDismissed,
  streamingSessionResponse,
  userId,
  sessionTitleById,
  goalGalleryInputRef,
  preparedSessionItems,
  preparedSessionMessage,
  isSubmittingPreparedSession,
  isSessionBusy,
  sessionProcessingState,
  sessionHistoryStatus,
  sessionStreamScrollRef,
  sessionStreamEndRef,
  onCloseArtworkDetail,
  onUpdateMetadata,
  onUpdateClassification,
  onDeleteArtwork,
  onNavigateArtworkDetail,
  onArtworkDetailRightModeChange,
  onIdentifyAgain,
  onRetryAnalysis,
  onOpenArtistFromInterpretation,
  onOpenSessionFromInterpretation,
  onSaveExistingGoal,
  onSaveSessionTitle,
  onSessionGoalInputChange,
  onSubmitGoal,
  onOpenSessionCapture,
  onPreparedSessionMessageChange,
  onOpenLibraryPicker,
  onRemovePreparedSessionItem,
  onSubmitPreparedSession,
  onRetrySessionHistory,
  onFileUpload,
  onOpenSessionArtwork,
  onAuthenticationRequired,
  interactionGate,
  onSignIn,
}: SessionViewProps) {
  const [sessionDetailsOpen, setSessionDetailsOpen] = React.useState(false);
  const [showSessionHistoryLoader, setShowSessionHistoryLoader] = React.useState(false);
  const [isComposerFocused, setIsComposerFocused] = React.useState(false);
  const [isMobileComposer, setIsMobileComposer] = React.useState(matchesMobileComposer);
  const composerTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const preservedSessionScrollTopRef = React.useRef<number | null>(null);
  const composerValue = preparedSessionItems.length > 0 ? preparedSessionMessage : sessionGoalInput;
  const resizeComposerTextarea = React.useCallback(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;

    const styles = window.getComputedStyle(textarea);
    const fontSize = parseFloat(styles.fontSize) || 14;
    const lineHeight = parseFloat(styles.lineHeight) || fontSize * 1.625;
    const paddingTop = parseFloat(styles.paddingTop) || 0;
    const paddingBottom = parseFloat(styles.paddingBottom) || 0;
    const borderTop = parseFloat(styles.borderTopWidth) || 0;
    const borderBottom = parseFloat(styles.borderBottomWidth) || 0;
    const chromeHeight = paddingTop + paddingBottom + borderTop + borderBottom;
    const contentHeight = textarea.scrollHeight + borderTop + borderBottom;
    const { height, isScrollable } = getSessionComposerHeight({
      contentHeight,
      lineHeight,
      chromeHeight,
      isFocused: isComposerFocused,
      isMobile: isMobileComposer,
    });

    textarea.style.height = 'auto';
    textarea.style.height = `${height}px`;
    textarea.style.overflowY = isScrollable ? 'auto' : 'hidden';
  }, [isComposerFocused, isMobileComposer]);

  React.useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia(MOBILE_COMPOSER_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setIsMobileComposer(event.matches);
    setIsMobileComposer(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  React.useEffect(() => {
    setSessionDetailsOpen(false);
  }, [activeSessionSummary.id]);

  React.useEffect(() => {
    if (sessionHistoryStatus !== 'loading') {
      setShowSessionHistoryLoader(false);
      return;
    }

    const timeout = window.setTimeout(() => setShowSessionHistoryLoader(true), 150);
    return () => window.clearTimeout(timeout);
  }, [sessionHistoryStatus]);

  React.useLayoutEffect(() => {
    resizeComposerTextarea();
  }, [composerValue, preparedSessionItems.length, resizeComposerTextarea]);

  React.useLayoutEffect(() => {
    if (artworkDetailItem || preservedSessionScrollTopRef.current === null) return;
    const scrollContainer = sessionStreamScrollRef.current;
    if (!scrollContainer) return;
    scrollContainer.scrollTop = preservedSessionScrollTopRef.current;
    preservedSessionScrollTopRef.current = null;
  }, [artworkDetailItem, sessionStreamScrollRef]);

  React.useEffect(() => {
    resizeComposerTextarea();
    const animationFrame = window.requestAnimationFrame(resizeComposerTextarea);
    void document.fonts?.ready.then(resizeComposerTextarea);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [resizeComposerTextarea]);

  const handleSubmitGoal = () => {
    if (isSessionBusy) {
      return;
    }
    const goal = sessionGoalInput.trim();
    if (!goal) {
      return;
    }
    onSubmitGoal(goal);
  };

  const handleOpenSessionArtwork = (item: GalleryItem) => {
    preservedSessionScrollTopRef.current = sessionStreamScrollRef.current?.scrollTop ?? 0;
    onOpenSessionArtwork(item);
  };

  if (artworkDetailItem) {
    return (
      <>
        <CanvasHeader
          parentLabel={activeSessionSummary.title}
          parentClick={onCloseArtworkDetail}
          childLabel={artworkDetailItem.artworkName || 'Untitled'}
          leftSlot={headerLeftSlot}
          rightSlot={artworkHeaderActions}
          isInline={true}
        />
        <div className="flex-1 overflow-hidden animate-in fade-in zoom-in-98 duration-300">
          <ArtworkDetailModal
            item={artworkDetailItem}
            onClose={onCloseArtworkDetail}
            onUpdateMetadata={onUpdateMetadata}
            onUpdateClassification={onUpdateClassification}
            onDelete={() => onDeleteArtwork(artworkDetailItem.id)}
            onNavigate={onNavigateArtworkDetail}
            rightMode={artworkDetailRightMode}
            onRightModeChange={onArtworkDetailRightModeChange}
            onIdentifyAgain={onIdentifyAgain}
            onRetryAnalysis={() => onRetryAnalysis(artworkDetailItem)}
            userId={userId}
            onNavigateToArtist={onOpenArtistFromInterpretation}
            onNavigateToSession={onOpenSessionFromInterpretation}
            sessionTitleById={sessionTitleById}
            editRequestToken={artworkHeaderEditToken}
            isInline={true}
          />
        </div>
      </>
    );
  }

  return (
    <>
      {showSessionHeader ? (
        <CanvasHeader
          parentLabel=""
          childLabel={activeSessionSummary.title}
          leftSlot={headerLeftSlot}
          isInline={true}
          onChildClick={() => setSessionDetailsOpen((value) => !value)}
          childExpanded={sessionDetailsOpen}
          childIndicator="info"
        />
      ) : (
        headerLeftSlot ? (
          <div className="pointer-events-none absolute left-4 top-3 z-20 md:hidden">
            <div className="pointer-events-auto">
              {headerLeftSlot}
            </div>
          </div>
        ) : null
      )}

      <SessionDetailsModal
        open={showSessionHeader && sessionDetailsOpen}
        title={activeSessionSummary.title}
        goal={sessionGoals[activeSessionSummary.id] || ''}
        items={activeSessionSummary.items}
        onSaveTitle={onSaveSessionTitle}
        onSaveGoal={onSaveExistingGoal}
        onOpenArtwork={handleOpenSessionArtwork}
        onClose={() => setSessionDetailsOpen(false)}
      />

      <div className="relative isolate flex-1 min-h-0 flex flex-col bg-[var(--color-bg-primary)]" style={{ overflow: 'clip' }}>

        {sessionHistoryStatus === 'loading' ? (
          <div
            className="relative z-10 flex flex-1 items-center justify-center px-6 pb-20"
            aria-busy="true"
            aria-label="Loading session history"
          >
            <div className={`flex flex-col items-center gap-3 transition-opacity duration-150 ${
              showSessionHistoryLoader ? 'opacity-100' : 'opacity-0'
            }`}>
              <div className="flex items-center gap-1.5" aria-hidden="true">
                {[0, 1, 2].map((index) => (
                  <span
                    key={index}
                    className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-300"
                    style={{ animationDelay: `${index * 160}ms` }}
                  />
                ))}
              </div>
              <p className="text-[12px] font-medium text-neutral-500">Loading session…</p>
            </div>
          </div>
        ) : sessionHistoryStatus === 'error' ? (
          <div className="relative z-10 flex flex-1 items-center justify-center px-6 pb-20">
            <div className="text-center">
              <p className="text-[13px] font-medium text-neutral-500">Couldn’t load this session.</p>
              <button
                type="button"
                onClick={onRetrySessionHistory}
                className="mt-3 rounded-full border border-neutral-200 bg-white px-4 py-2 text-[12px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                Try again
              </button>
            </div>
          </div>
        ) : sessionRenderBlocks.length === 0 ? (
          interactionGate?.blocked ? (
            <div className="relative z-10 flex flex-1 items-center justify-center px-6 pb-20">
              <div className="w-full max-w-[520px]">
                <GuestInteractionPrompt
                  gate={interactionGate}
                  onSignIn={onSignIn || (() => {})}
                />
              </div>
            </div>
          ) : sessionGoalDismissed.has(activeSessionSummary.id) ? (
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center pb-20 px-6">
              <div className="text-center">
                <h2 className="text-[28px] sm:text-[36px] font-semibold tracking-tight text-neutral-800 font-sans mb-2">
                  Start capturing
                </h2>
                <p className="text-[15px] text-neutral-400 font-medium font-sans">
                  Photograph an artwork to begin your session.
                </p>
                <button
                  onClick={onOpenLibraryPicker}
                  disabled={isSessionBusy}
                  className="mt-5 rounded-full border border-neutral-200 bg-white px-5 py-3 text-[13px] font-medium text-neutral-800 transition-colors hover:bg-neutral-50 disabled:opacity-40"
                >
                  {ARTWORK_CTA_ADD_FROM_COLLECTION}
                </button>
              </div>
            </div>
          ) : (
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6">
              <div className="w-full max-w-[640px]">
                <div className="space-y-4">
                  <h2 className="text-[28px] sm:text-[34px] font-semibold tracking-tight text-neutral-800 font-sans text-center">
                    What are you drawn to today?
                  </h2>
                  <>
                    <div className={preparedSessionItems.length > 0 ? 'overflow-hidden rounded-[24px] border border-neutral-200 bg-white shadow-sm' : ''}>
                    {preparedSessionItems.length > 0 && (
                      <div className="border-b border-neutral-100 px-4 pb-3 pt-4">
                        <div className="flex gap-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                          {preparedSessionItems.map((entry) => (
                            <div
                              key={entry.id}
                              className="group relative h-[92px] w-[92px] shrink-0 overflow-hidden rounded-[18px] border border-neutral-200 bg-neutral-50"
                            >
                              <img src={entry.previewUrl} alt={entry.label} className="h-full w-full object-cover" />
                              <button
                                onClick={() => onRemovePreparedSessionItem(entry.id)}
                                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/80 text-white shadow-sm transition-colors hover:bg-black"
                                aria-label={`Remove ${entry.label}`}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                                  <line x1="18" y1="6" x2="6" y2="18" />
                                  <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="relative">
                      <textarea
                        ref={composerTextareaRef}
                        placeholder={
                          preparedSessionItems.length > 0
                            ? SESSION_ARTWORK_QUESTION_PLACEHOLDER
                            : 'Ask anything about art'
                        }
                        aria-expanded={isMobileComposer ? isComposerFocused : undefined}
                        className={`w-full overflow-hidden bg-white px-5 py-4 pr-14 text-[16px] text-neutral-800 placeholder:text-neutral-400 resize-none outline-none leading-relaxed transition-[height,border-color] duration-200 ease-out ${
                          preparedSessionItems.length > 0
                            ? ''
                            : 'rounded-[20px] border border-neutral-100 shadow-sm focus:border-neutral-300 transition-colors'
                        }`}
                        rows={1}
                        value={composerValue}
                        onChange={(event) => {
                          if (preparedSessionItems.length > 0) {
                            onPreparedSessionMessageChange(event.target.value);
                          } else {
                            onSessionGoalInputChange(event.target.value);
                          }
                        }}
                        onFocus={() => setIsComposerFocused(true)}
                        onBlur={() => setIsComposerFocused(false)}
                        onKeyDown={(event) => {
                          if (shouldSubmitSessionComposerOnEnter({
                            key: event.key,
                            shiftKey: event.shiftKey,
                            isMobile: isMobileComposer,
                          })) {
                            event.preventDefault();
                            if (isSessionBusy) return;
                            if (preparedSessionItems.length > 0) {
                              onSubmitPreparedSession();
                            } else {
                              handleSubmitGoal();
                            }
                          }
                        }}
                      />
                      <button
                        onClick={preparedSessionItems.length > 0 ? onSubmitPreparedSession : handleSubmitGoal}
                        disabled={
                          isSessionBusy
                          || (preparedSessionItems.length > 0
                            ? isSubmittingPreparedSession
                            : !sessionGoalInput.trim())
                        }
                        className="absolute bottom-4 right-3 w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center disabled:opacity-20 transition-opacity"
                      >
                        {isSessionBusy ? (
                          <span
                            aria-label="Session busy"
                            className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white"
                          />
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                    {sessionProcessingState.kind !== 'idle' ? (
                      <SessionProcessingIndicator state={sessionProcessingState} />
                    ) : null}
                    <input
                      ref={goalGalleryInputRef}
                      type="file"
                      accept={SUPPORTED_UPLOAD_ACCEPT}
                      multiple
                      className="hidden"
                      disabled={isSessionBusy}
                      onChange={(event) => onFileUpload(event, 'gallery')}
                    />
                    <div className="mt-5 flex flex-wrap justify-center gap-3">
                      <button
                        onClick={onOpenLibraryPicker}
                        disabled={isSessionBusy}
                        className="flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-neutral-200 bg-white px-5 py-3 text-[14px] font-medium text-neutral-800 transition-colors hover:bg-neutral-50 disabled:opacity-40"
                      >
                        <AddFromCollectionIcon />
                        {ARTWORK_CTA_ADD_FROM_COLLECTION}
                      </button>
                      <button
                        onClick={() => goalGalleryInputRef.current?.click()}
                        disabled={isSessionBusy}
                        className="flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-neutral-200 bg-[var(--color-bg-tertiary)] px-5 py-3 text-[14px] font-medium text-neutral-800 transition-colors hover:bg-neutral-100 disabled:opacity-40"
                      >
                        <UploadPhotosIcon />
                        {ARTWORK_CTA_UPLOAD_PHOTOS}
                      </button>
                      <button
                        onClick={onOpenSessionCapture}
                        disabled={isSessionBusy}
                        className="flex items-center justify-center gap-2 whitespace-nowrap bg-white border border-neutral-200 text-neutral-700 rounded-full px-5 py-3 text-[14px] font-medium disabled:opacity-40"
                      >
                        <ScanArtworkIcon />
                        {ARTWORK_CTA_SCAN_ARTWORK}
                      </button>
                    </div>
                  </>
                </div>
              </div>
            </div>
          )
        ) : (
          <>
            <div
              ref={sessionStreamScrollRef}
              className="flex-1 animate-in fade-in duration-200 overflow-y-auto px-4 sm:px-10 pb-56 pt-3 sm:pt-4"
              onScroll={() => {}}
              style={{ overscrollBehaviorY: 'contain', touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            >
              <div className="mx-auto w-full max-w-[640px] space-y-3 sm:space-y-4">
                {sessionRenderBlocks.map((entry) =>
                  entry.type === 'artwork_group' || entry.type === 'input' ? (
                    <div key={entry.id} className="space-y-2">
                      <div className="flex justify-end">
                        <div className="flex items-center gap-2.5 rounded-[20px] border border-neutral-200 bg-[var(--color-bg-tertiary)] px-5 py-3 text-neutral-800 shadow-sm sm:rounded-[28px] sm:px-6 sm:py-3">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-50">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                          </svg>
                          <span className="text-[16px] leading-[1.7]">
                            {entry.sourceLabel}
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-start">
                        <div className="w-full max-w-[640px]">
                          <SessionArtworkCards
                            items={entry.items}
                            onOpenArtwork={handleOpenSessionArtwork}
                          />
                        </div>
                      </div>
                      {entry.type === 'input' && entry.userMessage?.text ? (
                        <div className="flex justify-end">
                          <div className="max-w-[85%] rounded-[20px] border border-neutral-200 bg-[var(--color-bg-tertiary)] px-5 py-3 text-neutral-800 shadow-sm sm:rounded-[28px] sm:px-6 sm:py-3">
                            <p className="whitespace-pre-wrap text-[16px] leading-[1.7]">
                              {entry.userMessage.text}
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : entry.type === 'commentary' ? (
                    <SessionCommentaryBlock
                      key={entry.id}
                      entry={entry}
                      sessionProcessingState={sessionProcessingState}
                      sessionId={activeSessionSummary.id}
                      onAuthenticationRequired={onAuthenticationRequired}
                    />
                  ) : entry.type === 'status' ? (
                    <SessionThreadStatus
                      key={entry.id}
                      message={entry.message}
                      tone={entry.tone}
                    />
                  ) : (
                    <React.Fragment key={entry.id}>
                      {entry.message.role === 'user' ? (
                        <div className="flex justify-end">
                          <div className="max-w-[85%] rounded-[20px] border border-neutral-200 bg-[var(--color-bg-tertiary)] px-5 py-3 text-neutral-800 shadow-sm sm:rounded-[28px] sm:px-6 sm:py-3">
                            <p className="whitespace-pre-wrap text-[16px] leading-[1.7]">{entry.message.text}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[16px] leading-[1.7] text-neutral-700">
                          <SessionMessageMarkdown>{entry.message.text}</SessionMessageMarkdown>
                        </div>
                      )}
                    </React.Fragment>
                  ),
                )}
                {sessionProcessingState.kind === 'adding_artworks'
                || sessionProcessingState.kind === 'analyzing_artworks'
                || (
                  sessionProcessingState.kind === 'writing_response'
                  && !sessionProcessingState.responseId
                ) ? (
                  <SessionProcessingIndicator state={sessionProcessingState} />
                ) : null}
                <div ref={sessionStreamEndRef} className="h-24 shrink-0" />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
