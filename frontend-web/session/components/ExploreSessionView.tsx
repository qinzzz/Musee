import React from 'react';
import CanvasHeader from '../../components/CanvasHeader';
import ArtworkDetailModal from '../../artwork/components/ArtworkDetailModal';
import { GalleryItem, ArtworkClassification } from '../../types';
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

type ExploreSessionViewProps = {
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
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>, mode: 'gallery' | 'camera') => void;
  onOpenSessionArtwork: (item: GalleryItem) => void;
};

const SessionDetailsPanel: React.FC<{
  title: string;
  goal: string;
  onSaveTitle: (title: string) => Promise<void>;
  onSaveGoal: (goal: string) => void;
}> = ({ title, goal, onSaveTitle, onSaveGoal }) => {
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

  return (
    <div className="rounded-b-[22px] border border-t-0 border-neutral-200 bg-[var(--color-bg-primary)] px-5 py-4 shadow-[0_18px_50px_rgba(0,0,0,0.08)] sm:px-8">
      <div className="max-w-[560px] space-y-4">
        <div>
          <p className="mb-2 text-[11px] font-medium text-neutral-400">Session name</p>
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
                setTitleDraft(title);
              }
            }}
            disabled={isSavingTitle}
            className="w-full rounded-[16px] border border-neutral-200 bg-white px-4 py-3 text-[16px] sm:text-[14px] text-neutral-800 outline-none transition-colors focus:border-neutral-300"
          />
        </div>
        <div>
          <p className="mb-2 text-[11px] font-medium text-neutral-400">Session goal</p>
          <textarea
            value={goalDraft}
            onChange={(event) => setGoalDraft(event.target.value)}
            onBlur={commitGoal}
            rows={3}
            placeholder="Add a focus for this session…"
            className="w-full resize-none rounded-[16px] border border-neutral-200 bg-white px-4 py-3 text-[16px] sm:text-[14px] leading-relaxed text-neutral-800 outline-none transition-colors focus:border-neutral-300"
          />
        </div>
      </div>
    </div>
  );
};

const InsightPill: React.FC<{ title: string; text: string }> = ({ title, text }) => {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <button
      onClick={() => setExpanded((value) => !value)}
      className="w-full text-left rounded-[14px] bg-white px-3 py-2.5 shadow-sm hover:shadow-md transition-shadow"
    >
      <p className="text-[11px] font-semibold text-neutral-800 leading-snug">{title}</p>
      {expanded && <p className="text-[11px] text-neutral-600 leading-relaxed mt-1.5">{text}</p>}
    </button>
  );
};

export default function ExploreSessionView({
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
  onFileUpload,
  onOpenSessionArtwork,
}: ExploreSessionViewProps) {
  const [sessionDetailsOpen, setSessionDetailsOpen] = React.useState(false);
  const composerTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);
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
    const oneLineHeight = Math.ceil(lineHeight + paddingTop + paddingBottom + borderTop + borderBottom);

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(textarea.scrollHeight + borderTop + borderBottom, oneLineHeight)}px`;
  }, []);

  React.useEffect(() => {
    setSessionDetailsOpen(false);
  }, [activeSessionSummary.id]);

  React.useLayoutEffect(() => {
    resizeComposerTextarea();
  }, [composerValue, preparedSessionItems.length, resizeComposerTextarea]);

  React.useEffect(() => {
    resizeComposerTextarea();
    const animationFrame = window.requestAnimationFrame(resizeComposerTextarea);
    void document.fonts?.ready.then(resizeComposerTextarea);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [resizeComposerTextarea]);

  const handleSubmitGoal = () => {
    const goal = sessionGoalInput.trim();
    if (!goal) {
      return;
    }
    onSubmitGoal(goal);
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

      <div className="relative isolate flex-1 min-h-0 flex flex-col bg-[var(--color-bg-primary)]" style={{ overflow: 'clip' }}>
        {showSessionHeader && sessionDetailsOpen ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-0">
            <div className="pointer-events-auto w-full sm:max-w-[640px]">
              <SessionDetailsPanel
                title={activeSessionSummary.title}
                goal={sessionGoals[activeSessionSummary.id] || ''}
                onSaveTitle={onSaveSessionTitle}
                onSaveGoal={onSaveExistingGoal}
              />
            </div>
          </div>
        ) : null}

        {sessionRenderBlocks.length === 0 ? (
          sessionGoalDismissed.has(activeSessionSummary.id) ? (
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
                  className="mt-5 rounded-full border border-neutral-200 bg-white px-5 py-3 text-[13px] font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
                >
                  {ARTWORK_CTA_ADD_FROM_COLLECTION}
                </button>
              </div>
            </div>
          ) : (
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6">
              <div className="w-full max-w-[640px]">
                {preparedSessionItems.length > 0 && (
                  <div className="mb-4 rounded-[24px] border border-neutral-200 bg-white p-4 shadow-sm">
                    <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
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
                <div className="space-y-4">
                  <h2 className="text-[28px] sm:text-[34px] font-semibold tracking-tight text-neutral-800 font-sans text-center">
                    What are you drawn to today?
                  </h2>
                  <div className="relative">
                    <textarea
                      ref={composerTextareaRef}
                      placeholder={
                        preparedSessionItems.length > 0
                          ? 'Add an opening question or note before you start chatting…'
                          : 'Ask anything about art'
                      }
                      className="w-full overflow-hidden bg-white rounded-[20px] px-5 py-4 pr-14 text-[16px] sm:text-[14px] text-neutral-800 placeholder:text-neutral-400 resize-none outline-none shadow-sm border border-neutral-100 focus:border-neutral-300 transition-colors leading-relaxed"
                      rows={1}
                      value={composerValue}
                      onChange={(event) => {
                        if (preparedSessionItems.length > 0) {
                          onPreparedSessionMessageChange(event.target.value);
                        } else {
                          onSessionGoalInputChange(event.target.value);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
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
                        preparedSessionItems.length > 0
                          ? isSubmittingPreparedSession
                          : !sessionGoalInput.trim()
                      }
                      className="absolute bottom-4 right-3 w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center disabled:opacity-20 transition-opacity"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </button>
                  </div>
                </div>
                <input
                  ref={goalGalleryInputRef}
                  type="file"
                  accept={SUPPORTED_UPLOAD_ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(event) => onFileUpload(event, 'gallery')}
                />
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <button
                    onClick={onOpenLibraryPicker}
                    className="flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-neutral-200 bg-white px-5 py-3 text-[13px] font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
                  >
                    <AddFromCollectionIcon />
                    {ARTWORK_CTA_ADD_FROM_COLLECTION}
                  </button>
                  <button
                    onClick={() => goalGalleryInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-neutral-200 bg-[var(--color-bg-tertiary)] px-5 py-3 text-[13px] font-medium text-neutral-800 transition-colors hover:bg-neutral-100"
                  >
                    <UploadPhotosIcon />
                    {ARTWORK_CTA_UPLOAD_PHOTOS}
                  </button>
                  <button
                    onClick={onOpenSessionCapture}
                    className="flex items-center justify-center gap-2 whitespace-nowrap bg-white border border-neutral-200 text-neutral-700 rounded-full px-5 py-3 text-[13px] font-medium"
                  >
                    <ScanArtworkIcon />
                    {ARTWORK_CTA_SCAN_ARTWORK}
                  </button>
                </div>
              </div>
            </div>
          )
        ) : (
          <>
            {activeSessionSummary.items.length > 0 ? (
              <div className="shrink-0 border-b border-neutral-100 bg-[var(--color-bg-primary)] px-4 sm:px-10 py-3">
                <div className="mx-auto w-full max-w-[640px]">
                  <div
                    className="flex gap-2.5 overflow-x-auto pb-1"
                    style={{ scrollbarWidth: 'none' }}
                  >
                    {activeSessionSummary.items.map((item) => (
                      <button
                        key={`session-strip-${item.id}`}
                        onClick={() => {
                          if (item.isDeletedPlaceholder || item.deleteStatus === 'pending') return;
                          onOpenSessionArtwork(item);
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
                          <div className="flex h-full w-full items-center justify-center bg-neutral-100 px-2 text-center text-[11px] font-medium text-neutral-400">
                            Deleted artwork
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
              </div>
            ) : null}
            <div
              ref={sessionStreamScrollRef}
              className="flex-1 overflow-y-auto px-4 sm:px-10 pb-56 pt-3 sm:pt-4"
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
                          <span className="text-[14px] leading-[1.7] sm:text-[16px] sm:leading-[1.8]">
                            {entry.sourceLabel}
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-start">
                        <div className="w-full max-w-[640px]">
                          <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                            {entry.items.map((item) => (
                              <button
                                key={item.id}
                                onClick={() => {
                                  if (item.isDeletedPlaceholder || item.deleteStatus === 'pending') return;
                                  onOpenSessionArtwork(item);
                                }}
                                className={`group relative shrink-0 overflow-hidden rounded-[24px] bg-white text-left shadow-sm transition-shadow ${
                                  item.isDeletedPlaceholder || item.deleteStatus === 'pending' ? 'cursor-default' : 'hover:shadow-md'
                                }`}
                                style={{
                                  width: entry.items.length === 1 ? '200px' : '160px',
                                  opacity: item.deleteStatus === 'pending' ? 0.45 : 1,
                                }}
                              >
                                <div className="relative aspect-square">
                                  {item.isDeletedPlaceholder ? (
                                    <div className="flex h-full items-center justify-center bg-neutral-100 text-neutral-400">
                                      <p className="text-[12px] font-medium">Deleted artwork</p>
                                    </div>
                                  ) : (
                                    <img
                                      src={item.url}
                                      alt={item.artworkName || 'Artwork'}
                                      className={`h-full w-full object-cover ${item.deleteStatus === 'pending' ? 'saturate-[0.7]' : ''}`}
                                    />
                                  )}
                                  {item.isAnalyzing && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70">
                                      <div className="relative">
                                        <div className="h-6 w-6 rounded-full border-2 border-neutral-100" />
                                        <div className="absolute inset-0 h-6 w-6 animate-spin rounded-full border-t-2 border-neutral-600" />
                                      </div>
                                      <p className="text-[10px] font-medium text-neutral-400">Analyzing</p>
                                    </div>
                                  )}
                                </div>
                                {!item.isDeletedPlaceholder && (
                                  <div className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent px-3 py-3 transition-opacity duration-200 ${item.deleteStatus === 'pending' ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}>
                                    <p className="truncate text-[12px] font-medium text-white">
                                      {item.isAnalyzing ? 'Analyzing…' : (item.artworkName || 'Untitled')}
                                    </p>
                                    {item.artistName && (
                                      <p className="mt-0.5 truncate text-[10px] text-white/75">{item.artistName}</p>
                                    )}
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      {entry.type === 'input' && entry.userMessage?.text ? (
                        <div className="flex justify-end">
                          <div className="max-w-[85%] rounded-[20px] border border-neutral-200 bg-[var(--color-bg-tertiary)] px-5 py-3 text-neutral-800 shadow-sm sm:rounded-[28px] sm:px-6 sm:py-3">
                            <p className="whitespace-pre-wrap text-[14px] leading-[1.7] sm:text-[16px] sm:leading-[1.8]">
                              {entry.userMessage.text}
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : entry.type === 'commentary' ? (
                    <React.Fragment key={entry.id}>
                      <div className="text-neutral-700">
                        {entry.status === 'pending' && !entry.message.text ? (
                          <div className="flex items-center gap-1.5 py-1">
                            <div className="w-2 h-2 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '160ms' }} />
                            <div className="w-2 h-2 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '320ms' }} />
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap text-[14px] leading-[1.7] sm:text-[16px] sm:leading-[1.8]">
                            {entry.message.text}
                          </p>
                        )}
                      </div>
                    </React.Fragment>
                  ) : (
                    <React.Fragment key={entry.id}>
                      {entry.message.role === 'user' ? (
                        <div className="flex justify-end">
                          <div className="max-w-[85%] rounded-[20px] border border-neutral-200 bg-[var(--color-bg-tertiary)] px-5 py-3 text-neutral-800 shadow-sm sm:rounded-[28px] sm:px-6 sm:py-3">
                            <p className="whitespace-pre-wrap text-[14px] leading-[1.7] sm:text-[16px] sm:leading-[1.8]">{entry.message.text}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-neutral-700">
                          <p className="whitespace-pre-wrap text-[14px] leading-[1.7] sm:text-[16px] sm:leading-[1.8]">{entry.message.text}</p>
                        </div>
                      )}
                    </React.Fragment>
                  ),
                )}
                <div ref={sessionStreamEndRef} className="h-24 shrink-0" />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
