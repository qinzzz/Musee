import type React from 'react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

import { ArtworkClassification } from '../../types';
import type { ArtworkDetailItem, ArtworkSessionMembership } from '../types';
import ArtworkClassificationChip from '../../components/ArtworkClassificationChip';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { getTagExplanation } from '../../api/chat';

type FunFact = { title: string; text: string };

const HoverTag: React.FC<{ tag: string; artworkId?: string }> = ({ tag, artworkId }) => {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const normalizeExplanation = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed.startsWith('{')) return trimmed;

    try {
      const parsed = JSON.parse(trimmed) as {
        explanation?: string;
        definition?: string;
        text?: string;
        meaning?: string;
      };

      return parsed.explanation?.trim()
        || parsed.definition?.trim()
        || parsed.text?.trim()
        || parsed.meaning?.trim()
        || trimmed;
    } catch {
      return trimmed;
    }
  };

  const loadExplanation = async () => {
    if (explanation || isLoading) return;
    setIsLoading(true);
    try {
      const result = await getTagExplanation(tag, artworkId);
      setExplanation(normalizeExplanation(result));
    } catch (error) {
      console.error('Failed to get tag explanation:', error);
      setExplanation('Unable to load explanation.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip
        onOpenChange={async (open) => {
          if (open) await loadExplanation();
        }}
      >
        <TooltipTrigger asChild>
          <span
            onPointerEnter={() => {
              void loadExplanation();
            }}
            onFocus={() => {
              void loadExplanation();
            }}
            className="cursor-default whitespace-nowrap rounded-full border border-neutral-100 bg-neutral-50 px-3 py-1 text-[10px] tracking-wide text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            {tag}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          collisionPadding={16}
          className="animate-in fade-in zoom-in-95 duration-150 border-neutral-200 shadow-[0_18px_50px_rgba(0,0,0,0.14)]"
        >
          {isLoading || !explanation ? (
            <div className="flex items-center justify-center py-2">
              <div className="h-4 w-4 animate-spin rounded-full border-t-2 border-neutral-400" />
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed text-neutral-600">{explanation}</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const FunFactItem: React.FC<{
  point: FunFact;
  index: number;
  colors: { dot: string; bg: string; border: string; text: string };
}> = ({ point, index, colors }) => {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        background: open ? colors.bg : 'transparent',
        border: `1px solid ${open ? colors.border : '#f0ece8'}`,
        borderRadius: 10,
        transition: 'background 200ms, border-color 200ms',
      }}
    >
      <button onClick={() => setOpen((current) => !current)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <span
          style={{
            background: open ? colors.dot : '#e8e4df',
            color: open ? '#fff' : '#aaa',
            borderRadius: 4,
            minWidth: 18,
            height: 18,
            fontSize: 9,
            fontFamily: 'monospace',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 200ms, color 200ms',
          }}
        >
          {index + 1}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: open ? colors.text : '#555',
            flex: 1,
            letterSpacing: '0.02em',
            transition: 'color 200ms',
          }}
        >
          {point.title}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            color: open ? colors.dot : '#ccc',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 200ms, color 200ms',
            flexShrink: 0,
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.7,
            color: colors.text,
            fontFamily: 'var(--font-family-serif)',
            padding: '0 14px 14px 34px',
            opacity: 0.85,
          }}
        >
          {point.text}
        </p>
      )}
    </div>
  );
};

type Props = {
  item: ArtworkDetailItem;
  isEditing: boolean;
  editValues: { artist: string; title: string; date: string; medium: string };
  setEditValues: React.Dispatch<React.SetStateAction<{ artist: string; title: string; date: string; medium: string }>>;
  editTags: string[];
  setEditTags: React.Dispatch<React.SetStateAction<string[]>>;
  tagInput: string;
  setTagInput: React.Dispatch<React.SetStateAction<string>>;
  firstEditInputRef: React.RefObject<HTMLInputElement | null>;
  handleEditKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  cancelEditing: () => void;
  onNavigateToArtist?: (artistEntityId: string | undefined, artworkId: string | undefined, artistName: string | undefined) => void;
  onNavigateToSession?: (sessionId: string) => void;
  onUpdateClassification?: (itemId: string, classification: ArtworkClassification) => Promise<void>;
  currentClassification: ArtworkClassification | 'unsorted';
  isInitialIdentifying: boolean;
  isReidentifying: boolean;
  hasNavigationFooter: boolean;
  displayArtist?: string;
  displayTitle?: string;
  displayDate?: string;
  displayMedium?: string;
  displayDescription?: string;
  formatArtworkDisplayDate: (value?: string | null) => string;
  sessionMemberships: ArtworkSessionMembership[];
  funFacts: FunFact[];
  markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'];
  isFailureAlertDismissed: boolean;
  setIsFailureAlertDismissed: React.Dispatch<React.SetStateAction<boolean>>;
  canRetryAnalysis: boolean;
  isRetryingAnalysis: boolean;
  setIsRetryingAnalysis: React.Dispatch<React.SetStateAction<boolean>>;
  onRetryAnalysis?: () => Promise<void> | void;
};

export default function ArtworkDetailMetadataPanel({
  item,
  isEditing,
  editValues,
  setEditValues,
  editTags,
  setEditTags,
  tagInput,
  setTagInput,
  firstEditInputRef,
  handleEditKeyDown,
  cancelEditing,
  onNavigateToArtist,
  onNavigateToSession,
  onUpdateClassification,
  currentClassification,
  isInitialIdentifying,
  isReidentifying,
  hasNavigationFooter,
  displayArtist,
  displayTitle,
  displayDate,
  displayMedium,
  displayDescription,
  formatArtworkDisplayDate,
  sessionMemberships,
  funFacts,
  markdownComponents,
  isFailureAlertDismissed,
  setIsFailureAlertDismissed,
  canRetryAnalysis,
  isRetryingAnalysis,
  setIsRetryingAnalysis,
  onRetryAnalysis,
}: Props) {
  return (
    <div className={`space-y-5 p-5 sm:flex-1 sm:min-h-0 sm:overflow-y-auto sm:space-y-7 sm:p-7 ${hasNavigationFooter ? 'pb-28 sm:pb-32' : 'pb-20 sm:pb-7'}`}>
      {!item.isAnalyzing && item.analysisStatus === 'failed' && item.streamingText && !isFailureAlertDismissed && (
        <Alert className="rounded-xl border-red-200 bg-red-50/80 px-4 py-3 text-red-900">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <AlertTitle className="text-[10px] font-bold uppercase tracking-[0.24em] text-red-600">
                Analysis failed
              </AlertTitle>
              <AlertDescription className="mt-2 text-[13px] leading-relaxed text-red-800">
                {item.streamingText}
              </AlertDescription>
              {canRetryAnalysis ? (
                <div className="mt-3">
                  <button
                    type="button"
                    disabled={isRetryingAnalysis}
                    onClick={async () => {
                      if (!onRetryAnalysis || isRetryingAnalysis) return;
                      setIsRetryingAnalysis(true);
                      try {
                        await onRetryAnalysis();
                        setIsFailureAlertDismissed(false);
                      } finally {
                        setIsRetryingAnalysis(false);
                      }
                    }}
                    className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-[12px] font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Retry
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setIsFailureAlertDismissed(true)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-red-400 transition-colors hover:bg-red-100 hover:text-red-700"
              aria-label="Dismiss analysis error"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </Alert>
      )}

      {isInitialIdentifying && !isEditing && (
        <Alert className="flex items-start gap-3 rounded-xl px-3 py-3">
          <div className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-t-[1.5px] border-neutral-700" />
          <div className="min-w-0">
            <AlertTitle className="text-[10px] font-bold uppercase tracking-[0.24em] text-neutral-500">
              Identifying artwork
            </AlertTitle>
            <AlertDescription className="mt-1 text-[12px] text-neutral-500">
              Generating title, artist, and interpretation.
            </AlertDescription>
          </div>
        </Alert>
      )}

      {isEditing ? (
        <div className="space-y-4">
          {displayArtist && (
            <div>
              <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.4em] text-neutral-400">Artist</p>
              <input
                ref={firstEditInputRef}
                value={editValues.artist}
                onChange={(event) => setEditValues((value) => ({ ...value, artist: event.target.value }))}
                onKeyDown={handleEditKeyDown}
                className="w-full border-b border-neutral-300 bg-transparent text-[15px] font-medium tracking-tight text-neutral-900 outline-none focus:border-neutral-600"
              />
            </div>
          )}
          {displayTitle && (
            <div>
              <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.4em] text-neutral-400">Title</p>
              <input
                value={editValues.title}
                onChange={(event) => setEditValues((value) => ({ ...value, title: event.target.value }))}
                onKeyDown={handleEditKeyDown}
                className="w-full border-b border-neutral-300 bg-transparent text-[14px] text-neutral-700 outline-none focus:border-neutral-600"
              />
            </div>
          )}
          <div className="flex gap-6">
            {displayDate && (
              <div>
                <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.4em] text-neutral-400">Date</p>
                <input
                  value={editValues.date}
                  onChange={(event) => setEditValues((value) => ({ ...value, date: event.target.value }))}
                  onKeyDown={handleEditKeyDown}
                  placeholder="e.g. 1889"
                  className="w-28 border-b border-neutral-300 bg-transparent text-[13px] text-neutral-600 outline-none focus:border-neutral-600"
                />
              </div>
            )}
            {displayMedium && (
              <div>
                <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.4em] text-neutral-400">Medium</p>
                <input
                  value={editValues.medium}
                  onChange={(event) => setEditValues((value) => ({ ...value, medium: event.target.value }))}
                  onKeyDown={handleEditKeyDown}
                  placeholder="e.g. Oil on canvas"
                  className="w-44 border-b border-neutral-300 bg-transparent text-[13px] text-neutral-600 outline-none focus:border-neutral-600"
                />
              </div>
            )}
          </div>
        </div>
      ) : (displayArtist || displayTitle || displayDate || displayMedium) ? (
        <div className="min-w-0 space-y-3">
          <div className="min-w-0">
            {displayTitle && (
              <div className="break-words text-[20px] leading-tight text-neutral-700 sm:text-[24px]">
                {editValues.title || displayTitle}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-neutral-400">
              {displayArtist && (
                <span
                  className="text-[15px] font-medium tracking-tight text-neutral-900 sm:text-[17px]"
                  style={(item.artistEntityId || item.artworkId) ? { cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 } : undefined}
                  onClick={(item.artistEntityId || item.artworkId) ? (event) => {
                    event.stopPropagation();
                    onNavigateToArtist?.(item.artistEntityId, item.artworkId, item.artistName);
                  } : undefined}
                >
                  {editValues.artist || displayArtist}
                </span>
              )}
              {displayDate && (
                <>
                  {displayArtist && <span className="text-neutral-300">·</span>}
                  <span>{editValues.date ? formatArtworkDisplayDate(editValues.date) : formatArtworkDisplayDate(displayDate)}</span>
                </>
              )}
              {displayMedium && (
                <>
                  {(displayArtist || displayDate) && <span className="text-neutral-300">·</span>}
                  <span>{editValues.medium || displayMedium}</span>
                </>
              )}
            </div>
          </div>
          {item.artworkId && onUpdateClassification && !item.isAnalyzing && (
            <ArtworkClassificationChip
              classification={currentClassification}
              onChange={(classification) => onUpdateClassification(item.id, classification)}
              className="px-3 py-1.5 text-[11px] font-semibold shadow-none"
            />
          )}
        </div>
      ) : null}

      {!item.isAnalyzing && (editTags.length > 0 || isEditing) && (
        <div>
          {isEditing ? (
            <div className="flex flex-wrap items-center gap-2">
              {editTags.map((tag, index) => (
                <span
                  key={index}
                  className="flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 pl-3 pr-1.5 py-1 text-[10px] tracking-wide text-neutral-500"
                >
                  {tag}
                  <button
                    onClick={() => setEditTags((previous) => previous.filter((_, tagIndex) => tagIndex !== index))}
                    className="flex h-4 w-4 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-700"
                    title="Remove tag"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.key === 'Enter' || event.key === ',') && tagInput.trim()) {
                    event.preventDefault();
                    const newTag = tagInput.trim().startsWith('#') ? tagInput.trim() : `#${tagInput.trim()}`;
                    setEditTags((previous) => [...previous, newTag]);
                    setTagInput('');
                  } else if (event.key === 'Escape') {
                    cancelEditing();
                  }
                }}
                placeholder="add tag…"
                className="min-w-[70px] w-24 border-b border-neutral-300 bg-transparent py-1 text-[10px] text-neutral-500 outline-none focus:border-neutral-600"
              />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {editTags.map((tag, index) => (
                <HoverTag key={index} tag={tag} artworkId={item.artworkId} />
              ))}
            </div>
          )}
        </div>
      )}

      {sessionMemberships.length > 0 && (
        <div className="space-y-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.4em] text-neutral-400">
            {sessionMemberships.length === 1 ? 'Session' : 'Sessions'}
          </p>
          <div className="flex flex-wrap gap-2">
            {sessionMemberships.map((membership) => (
              <button
                key={membership.sessionId}
                type="button"
                onClick={() => onNavigateToSession?.(membership.sessionId)}
                className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[11px] font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-900"
                title={membership.sessionId}
              >
                {membership.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {isReidentifying && !isEditing && (
        <Alert className="flex items-start gap-3 rounded-xl px-3 py-3">
          <div className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-t-[1.5px] border-neutral-700" />
          <div className="min-w-0">
            <AlertTitle className="text-[10px] font-bold uppercase tracking-[0.24em] text-neutral-500">
              Re-identifying artwork
            </AlertTitle>
            <AlertDescription className="mt-1 text-[12px] text-neutral-500">
              Reassessing the artwork with the latest information.
            </AlertDescription>
          </div>
        </Alert>
      )}

      {displayDescription && (
        <div>
          <div className="font-serif text-[13px] leading-relaxed text-neutral-600 sm:text-[14px]">
            <ReactMarkdown components={markdownComponents}>{displayDescription}</ReactMarkdown>
            {item.isAnalyzing && (
              <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-neutral-400" />
            )}
          </div>
        </div>
      )}

      {funFacts.length > 0 && (
        <div className="border-t border-neutral-50 pt-5">
          <p className="mb-3 text-[10px] font-medium tracking-[0.08em] text-neutral-400">Fun facts</p>
          <div className="space-y-1.5">
            {funFacts.map((point, index) => {
              const colors = [
                { dot: '#7F77DD', bg: '#EEEDFE', border: '#C5C1F0', text: '#3C3489' },
                { dot: '#1D9E75', bg: '#E1F5EE', border: '#5DCAA5', text: '#085041' },
                { dot: '#D85A30', bg: '#FAECE7', border: '#F0997B', text: '#712B13' },
              ];
              const palette = colors[index % colors.length];
              return <FunFactItem key={index} point={point} index={index} colors={palette} />;
            })}
          </div>
        </div>
      )}

      {!item.isAnalyzing && item.referenceUrls && item.referenceUrls.length > 0 && (
        <div className="pt-1 pb-2">
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.4em] text-neutral-400">Sources</p>
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none', touchAction: 'pan-x' }}>
            {item.referenceUrls.map((reference, index) => {
              const pageUrl = typeof reference === 'string' ? reference : reference.page_url;
              const thumbnail = typeof reference === 'string' ? undefined : reference.thumbnail;
              const title = typeof reference === 'string' ? undefined : reference.title;
              let hostname = pageUrl;
              try {
                hostname = new URL(pageUrl).hostname.replace(/^www\./, '');
              } catch {}

              return (
                <a
                  key={index}
                  href={pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-28 shrink-0 overflow-hidden rounded-xl border border-neutral-100 shadow-sm transition-colors hover:border-neutral-300 hover:shadow-md"
                  title={title || hostname}
                >
                  <div className="relative h-[4.5rem] w-full overflow-hidden bg-neutral-50">
                    <div className="absolute inset-0 flex items-center justify-center text-neutral-200">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    </div>
                    {thumbnail && (
                      <img
                        src={thumbnail}
                        className="absolute inset-0 h-full w-full object-cover"
                        alt={hostname}
                        onError={(event) => {
                          (event.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <span className="block truncate text-[9px] leading-tight text-neutral-500">{hostname}</span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
