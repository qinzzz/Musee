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

export type ActionBarMode = 'session';

interface Props {
  mode: ActionBarMode;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>, mode: 'gallery' | 'camera') => void;
  onOpenSessionCapture: () => void;
  onOpenLibraryPicker: () => void;
  onInquiry?: (text: string) => Promise<boolean>;
  onLike?: () => void;
  onCollect?: () => void;
  onDelete?: () => void;
  onCommunity?: () => void;
  isCommunityActive?: boolean;
  isAnalyzing?: boolean;
  isInquiryDisabled?: boolean;
  isLiked?: boolean;
  activeItem?: GalleryItem;
  placeholder?: string;
}

const ContextualActionBar: React.FC<Props> = ({
  onUpload,
  onOpenSessionCapture,
  onOpenLibraryPicker,
  onInquiry,
  onLike,
  onCollect,
  onDelete,
  onCommunity,
  isCommunityActive,
  isAnalyzing,
  isInquiryDisabled,
  isLiked,
  activeItem,
  placeholder,
}) => {
  const [text, setText] = useState('');
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Scan artwork is the most frequent mid-session action, so it gets its own
  // button next to "+"; the menu holds the bring-in-existing-images actions.
  const addArtworkActions = [
    {
      label: ARTWORK_CTA_ADD_FROM_COLLECTION,
      icon: <AddFromCollectionIcon size={18} />,
      onSelect: onOpenLibraryPicker,
      disabled: false,
    },
    {
      label: ARTWORK_CTA_UPLOAD_PHOTOS,
      icon: <UploadPhotosIcon size={18} />,
      onSelect: () => galleryInputRef.current?.click(),
      disabled: Boolean(isAnalyzing),
    },
  ];

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
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
        disabled={isAnalyzing}
      />

      <div className="absolute bottom-0 left-0 right-0 z-[20] px-3 sm:px-6 pb-3 sm:pb-5 bg-gradient-to-t from-[var(--color-bg-primary)] via-[color:rgba(255,255,255,0.95)] to-transparent pt-8" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.75rem)' }}>
        <div className="mx-auto w-full max-w-[640px] space-y-3">
          {activeItem && (
            <div className="rounded-[28px] border border-neutral-200 bg-white px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] tracking-[0.18em] uppercase text-neutral-400">Artwork actions</p>
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenSessionCapture}
                disabled={isAnalyzing}
                aria-label={ARTWORK_CTA_SCAN_ARTWORK}
                title={ARTWORK_CTA_SCAN_ARTWORK}
                className="w-10 h-10 shrink-0 rounded-full text-neutral-700 flex items-center justify-center transition-colors hover:bg-neutral-100 disabled:opacity-40"
              >
                <ScanArtworkIcon size={20} />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={ARTWORK_CTA_ADD_MENU}
                    className="w-10 h-10 shrink-0 rounded-full text-neutral-700 flex items-center justify-center transition-colors hover:bg-neutral-100 data-[state=open]:bg-neutral-100 [&[data-state=open]>svg]:rotate-45"
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
                      onSelect={() => action.onSelect()}
                      className="gap-3 rounded-[14px] px-3.5 py-3 text-[14px] font-medium text-neutral-800"
                    >
                      {action.icon}
                      <span>{action.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={placeholder || 'Add a reflection, memory, or association...'}
                className="flex-1 min-w-0 h-14 rounded-full border border-neutral-200 bg-white px-6 text-[16px] text-neutral-700 outline-none placeholder-neutral-400"
              />
              <button
                type="submit"
                className="w-10 h-10 shrink-0 rounded-full bg-neutral-900 text-white flex items-center justify-center disabled:opacity-30"
                disabled={!text.trim() || isInquiryDisabled}
                title={isInquiryDisabled ? 'Waiting for response' : 'Send'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default ContextualActionBar;
