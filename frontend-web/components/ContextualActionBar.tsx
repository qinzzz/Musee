import React, { useRef, useState } from 'react';
import { GalleryItem } from '../types';
import { SUPPORTED_UPLOAD_ACCEPT } from '../lib/uploadValidation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  ARTWORK_CTA_ADD_FROM_COLLECTION,
  ARTWORK_CTA_ADD_MENU,
  ARTWORK_CTA_SCAN_ARTWORK,
  ARTWORK_CTA_UPLOAD_PHOTOS,
} from '../lib/artworkSourceCtas';
import {
  AddFromCollectionIcon,
  ScanArtworkIcon,
  UploadPhotosIcon,
} from './ArtworkSourceIcons';
import {
  getSessionComposerHeight,
  shouldSubmitSessionComposerOnEnter,
} from '../session/lib/sessionComposerBehavior';
import { SESSION_ARTWORK_QUESTION_PLACEHOLDER } from '../session/constants';

const MOBILE_COMPOSER_QUERY = '(max-width: 639px)';
export const SESSION_QUESTION_PLACEHOLDER = 'Ask a question…';

const matchesMobileComposer = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia(MOBILE_COMPOSER_QUERY).matches
);

export type ActionBarMode = 'session';

type StagedItem = {
  id: string;
  previewUrl: string;
  label: string;
};

interface Props {
  mode: ActionBarMode;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>, mode: 'gallery' | 'camera') => void;
  onOpenSessionCapture: () => void;
  onOpenLibraryPicker: () => void;
  stagedItems?: StagedItem[];
  onRemoveStagedItem?: (entryId: string) => void;
  onSubmitStagedBatch?: (message: string) => Promise<boolean>;
  isSubmittingStagedBatch?: boolean;
  onInquiry?: (text: string) => Promise<boolean>;
  onLike?: () => void;
  onCollect?: () => void;
  onDelete?: () => void;
  onCommunity?: () => void;
  isCommunityActive?: boolean;
  isAnalyzing?: boolean;
  isInquiryDisabled?: boolean;
  isBusy?: boolean;
  isLiked?: boolean;
  activeItem?: GalleryItem;
  placeholder?: string;
}

const ContextualActionBar: React.FC<Props> = ({
  onUpload,
  onOpenSessionCapture,
  onOpenLibraryPicker,
  stagedItems = [],
  onRemoveStagedItem,
  onSubmitStagedBatch,
  isSubmittingStagedBatch,
  onInquiry,
  onLike,
  onCollect,
  onDelete,
  onCommunity,
  isCommunityActive,
  isAnalyzing,
  isInquiryDisabled,
  isBusy,
  isLiked,
  activeItem,
  placeholder,
}) => {
  const [text, setText] = useState('');
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [isMobileComposer, setIsMobileComposer] = useState(matchesMobileComposer);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionBusy = Boolean(isBusy || isAnalyzing || isInquiryDisabled || isSubmittingStagedBatch);
  const isComposerExpanded = isComposerFocused;

  const resizeComposerTextarea = React.useCallback(() => {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;

    const styles = window.getComputedStyle(textarea);
    const fontSize = parseFloat(styles.fontSize) || 16;
    const lineHeight = parseFloat(styles.lineHeight) || fontSize * 1.5;
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

  React.useLayoutEffect(() => {
    resizeComposerTextarea();
  }, [resizeComposerTextarea, text]);

  React.useEffect(() => {
    if (sessionBusy) {
      setIsAddMenuOpen(false);
    }
  }, [sessionBusy]);

  // Scan artwork is the most frequent mid-session action, so it gets its own
  // button next to "+"; the menu holds the bring-in-existing-images actions.
  const addArtworkActions = [
    {
      label: ARTWORK_CTA_ADD_FROM_COLLECTION,
      icon: <AddFromCollectionIcon size={18} />,
      onSelect: onOpenLibraryPicker,
      disabled: sessionBusy,
    },
    {
      label: ARTWORK_CTA_UPLOAD_PHOTOS,
      icon: <UploadPhotosIcon size={18} />,
      onSelect: () => galleryInputRef.current?.click(),
      disabled: sessionBusy,
    },
  ];

  const hasStagedItems = stagedItems.length > 0;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (sessionBusy) return;
    if (hasStagedItems) {
      const didSubmit = await onSubmitStagedBatch?.(text.trim());
      if (didSubmit) {
        setText('');
      }
      return;
    }
    const value = text.trim();
    if (!value || isInquiryDisabled) return;
    const didSubmit = await onInquiry?.(value);
    if (didSubmit !== false) {
      setText('');
    }
  };

  return (
    <>
      <input
        ref={galleryInputRef}
        type="file"
        accept={SUPPORTED_UPLOAD_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => onUpload(e, 'gallery')}
        disabled={sessionBusy}
      />

      <div className="absolute bottom-0 left-0 right-0 z-[20] px-3 sm:px-6 pb-3 sm:pb-5 bg-gradient-to-t from-[var(--color-bg-primary)] via-[color:rgba(255,255,255,0.95)] to-transparent pt-8" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.75rem)' }}>
        <div className="mx-auto w-full max-w-[640px] space-y-3">
          {activeItem && (
            <div className="rounded-[28px] border border-neutral-200 bg-white px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[12px] tracking-[0.18em] uppercase text-neutral-500">Artwork actions</p>
                  <p className="mt-1 truncate text-[15px] font-medium text-neutral-900">
                    {activeItem.artworkName || activeItem.artistName || 'Selected artwork'}
                  </p>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <button
                    onClick={onLike}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isLiked ? 'text-red-400' : 'text-neutral-400 hover:text-neutral-700'}`}
                    title={isLiked ? 'Unlike' : 'Like'}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.7 0l-1.1 1.1-1.1-1.1a5.5 5.5 0 0 0-7.7 7.7l1.1 1.1 7.7 7.7 7.7-7.7 1.1-1.1a5.5 5.5 0 0 0 0-7.7z"/>
                    </svg>
                  </button>
                  <button
                    onClick={onCommunity}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isCommunityActive ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-700'}`}
                    title="Community"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                  </button>
                  <button
                    onClick={onCollect}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 transition-colors"
                    title="Collect"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 3h18v18H3z"/><path d="M12 8v8"/><path d="M8 12h8"/>
                    </svg>
                  </button>
                  <button
                    onClick={onDelete}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-neutral-500 hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          <form
            onSubmit={submit}
            className="relative rounded-[34px] border border-neutral-200 bg-white px-4 sm:px-6 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.10)]"
          >
            {hasStagedItems && (
              <div className="mb-3 flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {stagedItems.map((entry) => (
                  <div
                    key={entry.id}
                    className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-[16px] border border-neutral-200 bg-neutral-50"
                  >
                    <img src={entry.previewUrl} alt={entry.label} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => onRemoveStagedItem?.(entry.id)}
                      disabled={sessionBusy}
                      className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/80 text-white shadow-sm transition-colors hover:bg-black"
                      aria-label={`Remove ${entry.label}`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className={`flex gap-2 ${isComposerExpanded ? 'flex-wrap items-end' : 'items-center'}`}>
              <button
                type="button"
                onClick={onOpenSessionCapture}
                disabled={sessionBusy}
                aria-label={ARTWORK_CTA_SCAN_ARTWORK}
                title={ARTWORK_CTA_SCAN_ARTWORK}
                className={`w-10 h-10 shrink-0 rounded-full text-neutral-700 flex items-center justify-center transition-colors hover:bg-neutral-100 disabled:opacity-40 ${isComposerExpanded ? 'order-2' : ''}`}
              >
                <ScanArtworkIcon size={20} />
              </button>
              <div className={isComposerExpanded ? 'order-2' : ''}>
              <DropdownMenu
                open={isAddMenuOpen}
                onOpenChange={(open) => setIsAddMenuOpen(open && !sessionBusy)}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={sessionBusy}
                    aria-label={ARTWORK_CTA_ADD_MENU}
                    className="w-10 h-10 shrink-0 rounded-full text-neutral-700 flex items-center justify-center transition-colors hover:bg-neutral-100 disabled:opacity-40 data-[state=open]:bg-neutral-100 [&[data-state=open]>svg]:rotate-45"
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      className="transition-transform"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-[240px] p-2">
                  {addArtworkActions.map((action) => (
                    <DropdownMenuItem
                      key={action.label}
                      disabled={action.disabled}
                      onSelect={() => {
                        if (!sessionBusy && !action.disabled) {
                          action.onSelect();
                        }
                      }}
                      className="gap-3 rounded-[14px] px-3.5 py-3 text-[14px] font-medium text-neutral-800 data-[disabled]:cursor-not-allowed data-[disabled]:text-neutral-400 data-[disabled]:opacity-45"
                    >
                      {action.icon}
                      <span>{action.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
              <textarea
                ref={composerTextareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onFocus={() => setIsComposerFocused(true)}
                onBlur={() => setIsComposerFocused(false)}
                onKeyDown={(event) => {
                  if (shouldSubmitSessionComposerOnEnter({
                    key: event.key,
                    shiftKey: event.shiftKey,
                    isMobile: isMobileComposer,
                  })) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                rows={1}
                aria-expanded={isMobileComposer ? isComposerFocused : undefined}
                placeholder={hasStagedItems
                  ? SESSION_ARTWORK_QUESTION_PLACEHOLDER
                  : (placeholder || SESSION_QUESTION_PLACEHOLDER)}
                className={`min-w-0 resize-none rounded-[28px] border border-neutral-200 bg-white px-6 py-4 text-[16px] leading-6 text-neutral-700 outline-none placeholder-neutral-400 transition-[height,border-color] duration-200 ease-out focus:border-neutral-300 ${isComposerExpanded ? 'order-1 basis-full' : 'flex-1'}`}
              />
              <button
                type="submit"
                className={`w-10 h-10 shrink-0 rounded-full bg-neutral-900 text-white flex items-center justify-center disabled:opacity-30 ${isComposerExpanded ? 'order-2 ml-auto' : ''}`}
                disabled={sessionBusy || (!hasStagedItems && !text.trim())}
                title={sessionBusy ? 'Session busy' : 'Send'}
              >
                {sessionBusy ? (
                  <span
                    aria-label="Session busy"
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white"
                  />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default ContextualActionBar;
