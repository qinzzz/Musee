import React from 'react';
import CanvasHeader from './CanvasHeader';
import InterpretationModal from './InterpretationModal';
import { GalleryItem, Message, ArtworkClassification } from '../types';
import type { ArtistPageContext, ArtworkDetailContext } from '../lib/appNavigation';

type VisitSummaryLike = {
  id: string;
  title: string;
  location: string | null;
  items: GalleryItem[];
};

type VisitStreamMessage = Message & {
  id: string;
  createdAt: number;
  type?: 'text' | 'artwork_capture' | 'artwork_card';
  artworkId?: string;
};

type VisitStreamEntry =
  | {
      id: string;
      createdAt: number;
      type: 'artwork';
      item: GalleryItem;
    }
  | {
      id: string;
      createdAt: number;
      type: 'message';
      message: VisitStreamMessage;
    };

type InterpretationItem = GalleryItem & {
  allVisitItems?: GalleryItem[];
  is_liked?: boolean;
};

type ExploreSessionViewProps = {
  activeVisitSummary: VisitSummaryLike;
  activeVisitStream: VisitStreamEntry[];
  interpretingItem: InterpretationItem | null;
  artworkHeaderActions: React.ReactNode;
  artworkHeaderEditToken: number;
  artworkDetailContext: ArtworkDetailContext | null;
  interpretationRightMode: 'metadata' | 'community';
  interpretingMode: 'professional' | 'interactive';
  sessionGoalInput: string;
  sessionGoals: Record<string, string>;
  sessionGoalDismissed: Set<string>;
  streamingVisitResponse?: string;
  userId: string;
  goalGalleryInputRef: React.RefObject<HTMLInputElement | null>;
  goalCameraInputRef: React.RefObject<HTMLInputElement | null>;
  visitStreamScrollRef: React.RefObject<HTMLDivElement | null>;
  visitStreamEndRef: React.RefObject<HTMLDivElement | null>;
  onCloseArtworkDetail: () => void;
  onUpdateMetadata: (itemId: string, fields: Partial<GalleryItem>) => void;
  onUpdateClassification: (itemId: string, classification: ArtworkClassification) => Promise<void>;
  onDeleteArtwork: (itemId: string) => void;
  onNavigateInterpretation: (direction: 'prev' | 'next') => void;
  onInterpretationRightModeChange: (mode: 'metadata' | 'community') => void;
  onSwitchInterpretingMode: () => void;
  onRefreshAnalysis: () => Promise<void>;
  onOpenArtistFromInterpretation: (
    artistEntityId: string,
    artworkId: string,
    artistName?: string,
  ) => void;
  onSaveExistingGoal: (goal: string) => void;
  onSessionGoalInputChange: (value: string) => void;
  onSubmitGoal: (goal: string) => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>, mode: 'gallery' | 'camera') => void;
  onOpenSessionArtwork: (item: GalleryItem) => void;
};

const GoalBanner: React.FC<{ goal: string; onSave: (goal: string) => void }> = ({ goal, onSave }) => {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(goal);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== goal) {
      onSave(trimmed);
    }
    setEditing(false);
  };

  React.useEffect(() => {
    if (editing) {
      setDraft(goal);
      inputRef.current?.focus();
    }
  }, [editing, goal]);

  return (
    <div className="flex items-center gap-2 px-5 sm:px-10 py-2.5 bg-[#f7f4ee] border-b border-neutral-200/60">
      <span className="text-[13px] shrink-0">🎯</span>
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            }
            if (event.key === 'Escape') {
              setEditing(false);
            }
          }}
          className="flex-1 text-[14px] text-neutral-700 bg-transparent outline-none border-b border-neutral-400 leading-snug py-0.5"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="flex-1 text-left text-[14px] text-neutral-500 leading-snug hover:text-neutral-700 transition-colors"
        >
          {goal}
        </button>
      )}
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
  activeVisitSummary,
  activeVisitStream,
  interpretingItem,
  artworkHeaderActions,
  artworkHeaderEditToken,
  artworkDetailContext,
  interpretationRightMode,
  interpretingMode,
  sessionGoalInput,
  sessionGoals,
  sessionGoalDismissed,
  streamingVisitResponse,
  userId,
  goalGalleryInputRef,
  goalCameraInputRef,
  visitStreamScrollRef,
  visitStreamEndRef,
  onCloseArtworkDetail,
  onUpdateMetadata,
  onUpdateClassification,
  onDeleteArtwork,
  onNavigateInterpretation,
  onInterpretationRightModeChange,
  onSwitchInterpretingMode,
  onRefreshAnalysis,
  onOpenArtistFromInterpretation,
  onSaveExistingGoal,
  onSessionGoalInputChange,
  onSubmitGoal,
  onFileUpload,
  onOpenSessionArtwork,
}: ExploreSessionViewProps) {
  const handleSubmitGoal = () => {
    const goal = sessionGoalInput.trim();
    if (!goal) {
      return;
    }
    onSubmitGoal(goal);
  };

  if (interpretingItem) {
    return (
      <>
        <CanvasHeader
          parentLabel={activeVisitSummary.title}
          parentClick={onCloseArtworkDetail}
          childLabel={interpretingItem.artworkName || 'Untitled'}
          rightSlot={artworkHeaderActions}
          isInline={true}
        />
        <div className="flex-1 overflow-hidden animate-in fade-in zoom-in-98 duration-300">
          <InterpretationModal
            item={interpretingItem}
            onClose={onCloseArtworkDetail}
            onUpdateMetadata={onUpdateMetadata}
            onUpdateClassification={onUpdateClassification}
            onDelete={() => onDeleteArtwork(interpretingItem.id)}
            allVisitItems={interpretingItem.allVisitItems}
            onNavigate={onNavigateInterpretation}
            rightMode={interpretationRightMode}
            onRightModeChange={onInterpretationRightModeChange}
            interpretingMode={interpretingMode}
            onSwitchMode={onSwitchInterpretingMode}
            onRefreshAnalysis={onRefreshAnalysis}
            userId={userId}
            onNavigateToArtist={onOpenArtistFromInterpretation}
            navigationContextLabel={artworkDetailContext?.parentLabel || activeVisitSummary.title}
            editRequestToken={artworkHeaderEditToken}
            isInline={true}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <CanvasHeader
        parentLabel=""
        childLabel={activeVisitSummary.title}
        subtitle={activeVisitSummary.location || undefined}
        isInline={true}
      />

      {sessionGoals[activeVisitSummary.id] && (
        <GoalBanner
          goal={sessionGoals[activeVisitSummary.id]}
          onSave={onSaveExistingGoal}
        />
      )}

      <div className="relative isolate flex-1 min-h-0 flex flex-col bg-[#f7f4ee]" style={{ overflow: 'clip' }}>
        {activeVisitStream.length === 0 ? (
          sessionGoalDismissed.has(activeVisitSummary.id) ? (
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center pb-20 px-6">
              <div className="text-center animate-in fade-in zoom-in-95 duration-500">
                <h2 className="text-[28px] sm:text-[36px] font-semibold tracking-tight text-neutral-800 font-sans mb-2">
                  Start capturing
                </h2>
                <p className="text-[15px] text-neutral-400 font-medium font-sans">
                  Photograph an artwork to begin your session.
                </p>
              </div>
            </div>
          ) : (
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-24">
              <div className="w-full max-w-sm animate-in fade-in zoom-in-95 duration-500">
                <h2 className="text-[28px] sm:text-[34px] font-semibold tracking-tight text-neutral-800 font-sans mb-2 text-center">
                  What&apos;s your focus today?
                </h2>
                <p className="text-[14px] text-neutral-400 text-center mb-7">
                  Share your goal for this visit or skip and start capturing.
                </p>
                <div className="relative">
                  <textarea
                    placeholder="e.g. I want to learn about medieval art, find inspiration for my interior design…"
                    className="w-full bg-white rounded-[20px] px-5 py-4 pr-14 text-[14px] text-neutral-800 placeholder:text-neutral-400 resize-none outline-none shadow-sm border border-neutral-100 focus:border-neutral-300 transition-colors leading-relaxed"
                    rows={3}
                    value={sessionGoalInput}
                    onChange={(event) => onSessionGoalInputChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        handleSubmitGoal();
                      }
                    }}
                  />
                  <button
                    onClick={handleSubmitGoal}
                    disabled={!sessionGoalInput.trim()}
                    className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center disabled:opacity-20 transition-opacity"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
                <input
                  ref={goalGalleryInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => onFileUpload(event, 'gallery')}
                />
                <input
                  ref={goalCameraInputRef}
                  type="file"
                  accept="image/*"
                  capture={/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 'environment' : undefined}
                  className="hidden"
                  onChange={(event) => onFileUpload(event, 'camera')}
                />
                <div className="mt-5 flex gap-3">
                  <button
                    onClick={() => goalGalleryInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 bg-neutral-900 text-white rounded-full px-5 py-3 text-[13px] font-medium"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Capture artwork
                  </button>
                  <button
                    onClick={() => goalCameraInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 bg-white border border-neutral-200 text-neutral-700 rounded-full px-5 py-3 text-[13px] font-medium"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                      <circle cx="12" cy="13" r="4" />
                    </svg>
                    Camera
                  </button>
                </div>
              </div>
            </div>
          )
        ) : (
          <>
            {activeVisitStream.some((entry) => entry.type === 'artwork') && (() => {
              const collapsed = true;
              const ease = '0.5s cubic-bezier(0.68, -0.25, 0.27, 1.25)';
              const vh = window.innerHeight / 100;
              const thumbnailEntries = activeVisitStream.filter(
                (entry): entry is Extract<VisitStreamEntry, { type: 'artwork' }> =>
                  entry.type === 'artwork' && !entry.item.isDeletedPlaceholder,
              );

              if (thumbnailEntries.length === 0) {
                return null;
              }

              return (
                <div
                  className="relative shrink-0"
                  style={{ height: collapsed ? '88px' : `${45 * vh}px`, overflow: 'clip', transition: `height ${ease}` }}
                >
                  <div
                    className="h-full flex items-center gap-2 overflow-x-auto px-4 sm:px-6"
                    style={{ scrollbarWidth: 'none', touchAction: 'pan-x' }}
                  >
                    {thumbnailEntries.map((entry) => (
                        <button
                          key={entry.id}
                          onClick={() => onOpenSessionArtwork(entry.item)}
                          className="relative shrink-0 group overflow-hidden"
                          style={{
                            height: collapsed ? '68px' : '38vh',
                            width: collapsed ? '68px' : '420px',
                            maxWidth: collapsed ? '68px' : '420px',
                            borderRadius: collapsed ? '10px' : '16px',
                            boxShadow: collapsed ? '0 1px 6px rgba(0,0,0,0.12)' : '0 4px 24px rgba(0,0,0,0.14)',
                            flexShrink: 0,
                            transition: `all ${ease}`,
                          }}
                        >
                          <img
                            src={entry.item.url}
                            alt={entry.item.artworkName || 'Artwork'}
                            className="w-full h-full object-cover"
                          />
                          <div
                            className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                            style={{ opacity: collapsed ? 0 : undefined }}
                          >
                            <p className="text-white text-[12px] font-medium truncate">
                              {entry.item.artworkName || 'Untitled'}
                            </p>
                            {entry.item.artistName && (
                              <p className="text-white/70 text-[11px] truncate">{entry.item.artistName}</p>
                            )}
                          </div>
                          {entry.item.isAnalyzing && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/70">
                              <div className="relative mb-2">
                                <div className="w-7 h-7 border-2 border-neutral-100 rounded-full" />
                                <div className="absolute inset-0 w-7 h-7 border-t-2 border-neutral-700 rounded-full animate-spin" />
                              </div>
                              {!collapsed && (
                                <p className="text-[9px] tracking-[0.3em] uppercase text-neutral-500">Analyzing</p>
                              )}
                            </div>
                          )}
                        </button>
                      ))}
                    <div className="shrink-0 w-2 sm:w-4" />
                  </div>
                </div>
              );
            })()}

            <div
              ref={visitStreamScrollRef}
              className="flex-1 overflow-y-auto px-4 sm:px-10 pb-56 pt-3 sm:pt-4"
              onScroll={() => {}}
              style={{ overscrollBehaviorY: 'contain', touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            >
              <div className="mx-auto w-full max-w-[640px] space-y-3 sm:space-y-4">
                {activeVisitStream.map((entry) =>
                  entry.type === 'artwork' ? (
                    <div key={entry.id} className="space-y-2">
                      <div className="flex justify-end">
                        <div className="flex items-center gap-2 bg-neutral-900 text-white rounded-[20px] px-4 py-2.5">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                          </svg>
                          <span className="text-[13px]">Captured an artwork</span>
                        </div>
                      </div>
                      <div className="flex justify-start">
                        <button
                          onClick={() => {
                            if (entry.item.isDeletedPlaceholder) return;
                            onOpenSessionArtwork(entry.item);
                          }}
                          className={`relative overflow-hidden rounded-[20px] bg-white text-left shadow-sm transition-shadow ${
                            entry.item.isDeletedPlaceholder ? 'cursor-default' : 'hover:shadow-md'
                          }`}
                          style={{ maxWidth: '260px', width: '260px' }}
                        >
                          <div className="relative">
                            {entry.item.isDeletedPlaceholder ? (
                              <div
                                className="flex items-center justify-center bg-neutral-100 text-neutral-400"
                                style={{ height: '160px' }}
                              >
                                <p className="text-[11px] tracking-[0.28em] uppercase">Deleted artwork</p>
                              </div>
                            ) : (
                              <img
                                src={entry.item.url}
                                alt={entry.item.artworkName || 'Artwork'}
                                className="w-full object-cover"
                                style={{ height: '160px' }}
                              />
                            )}
                            {entry.item.isAnalyzing && (
                              <div className="absolute inset-0 bg-white/70 flex flex-col items-center justify-center gap-2">
                                <div className="relative">
                                  <div className="w-6 h-6 border-2 border-neutral-100 rounded-full" />
                                  <div className="absolute inset-0 w-6 h-6 border-t-2 border-neutral-600 rounded-full animate-spin" />
                                </div>
                                <p className="text-[9px] tracking-[0.3em] uppercase text-neutral-400">Analyzing</p>
                              </div>
                            )}
                          </div>
                          <div className="px-4 py-3">
                            <p className="text-[13px] font-semibold text-neutral-900 truncate">
                              {entry.item.isAnalyzing ? 'Analyzing…' : (entry.item.artworkName || 'Untitled')}
                            </p>
                            {entry.item.artistName && (
                              <p className="text-[11px] text-neutral-500 truncate mt-0.5">{entry.item.artistName}</p>
                            )}
                            {!entry.item.isAnalyzing && !entry.item.isDeletedPlaceholder && (
                              <p className="text-[11px] text-neutral-400 mt-2">Tap to explore →</p>
                            )}
                          </div>
                        </button>
                      </div>
                      {entry.item.insights && entry.item.insights.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[9px] tracking-[0.35em] uppercase text-neutral-400 font-bold px-1">Fun Facts</p>
                          {entry.item.insights.map((insight, index) => (
                            <InsightPill key={index} title={insight.title} text={insight.text} />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <React.Fragment key={entry.id}>
                      {entry.message.role === 'user' ? (
                        <div className="flex justify-end">
                          <div className="max-w-[85%] rounded-[20px] sm:rounded-[28px] px-5 py-3.5 sm:px-6 sm:py-5 bg-neutral-900 text-white">
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
                {typeof streamingVisitResponse === 'string' && (
                  streamingVisitResponse === '' ? (
                    <div className="flex items-center gap-1.5 py-1">
                      <div className="w-2 h-2 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '160ms' }} />
                      <div className="w-2 h-2 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '320ms' }} />
                    </div>
                  ) : (
                    <div className="text-neutral-700">
                      <p className="whitespace-pre-wrap text-[14px] leading-[1.7] sm:text-[16px] sm:leading-[1.8]">
                        {streamingVisitResponse}
                      </p>
                    </div>
                  )
                )}
                <div ref={visitStreamEndRef} className="h-24 shrink-0" />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
