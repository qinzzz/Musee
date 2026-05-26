import React, { useRef, useState } from 'react';
import { GalleryItem } from '../types';

export type ActionBarMode = 'session';

interface Props {
  mode: ActionBarMode;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>, mode: 'gallery' | 'camera') => void;
  onInquiry?: (text: string) => void;
  onLike?: () => void;
  onCollect?: () => void;
  onDelete?: () => void;
  onCommunity?: () => void;
  isCommunityActive?: boolean;
  isAnalyzing?: boolean;
  isLiked?: boolean;
  activeItem?: GalleryItem;
  placeholder?: string;
}

const ContextualActionBar: React.FC<Props> = ({
  onUpload,
  onInquiry,
  onLike,
  onCollect,
  onDelete,
  onCommunity,
  isCommunityActive,
  isAnalyzing,
  isLiked,
  activeItem,
  placeholder,
}) => {
  const [text, setText] = useState('');
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = text.trim();
    if (!value) return;
    onInquiry?.(value);
    setText('');
  };

  return (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture={isMobile ? 'environment' : undefined}
        className="hidden"
        onChange={(e) => onUpload(e, 'camera')}
        disabled={isAnalyzing}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => onUpload(e, 'gallery')}
        disabled={isAnalyzing}
      />

      <div className="absolute bottom-0 left-0 right-0 z-[20] px-3 sm:px-6 pb-3 sm:pb-5 bg-gradient-to-t from-[#f7f4ee] via-[#f7f4ee]/95 to-transparent pt-8" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.75rem)' }}>
        <div className="mx-auto w-full max-w-[640px] space-y-3">
          {activeItem && (
            <div className="rounded-[28px] border border-neutral-200 bg-white/96 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.08)] backdrop-blur">
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
            className="rounded-[34px] border border-neutral-200 bg-white/96 px-4 sm:px-6 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.10)] backdrop-blur"
          >
            <div className="flex items-center gap-3 mb-3">
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="rounded-[18px] bg-neutral-900 px-5 py-3 text-white text-[15px] font-medium flex items-center gap-3"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <span>Capture artwork</span>
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="rounded-[18px] border border-neutral-200 bg-[#f6f1e7] px-5 py-3 text-[15px] font-medium text-neutral-700 flex items-center gap-3"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
                </svg>
                <span>Camera</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={placeholder || 'Add a reflection, memory, or association...'}
                className="flex-1 h-14 rounded-full border border-neutral-200 bg-white px-6 text-[16px] text-neutral-700 outline-none placeholder-neutral-400"
              />
              <button
                type="submit"
                className="w-14 h-14 rounded-[18px] bg-neutral-900 text-white flex items-center justify-center disabled:opacity-30"
                disabled={!text.trim()}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
