
import React, { useState, useRef, useEffect } from 'react';
import { GalleryItem } from '../types';

export type ActionBarMode = 'corridor' | 'hall' | 'interpretation';

interface Props {
  mode: ActionBarMode;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>, mode: 'gallery' | 'camera') => void;
  onInquiry?: (text: string) => void;
  onChat?: () => void;
  onLike?: () => void;
  onCollect?: () => void;
  onDelete?: () => void;
  isAnalyzing?: boolean;
  isLiked?: boolean;
  activeItem?: GalleryItem;
  placeholder?: string;
  isAskExpanded?: boolean;
  onAskExpand?: () => void;
  onAskCollapse?: () => void;
}

const ContextualActionBar: React.FC<Props> = ({
  mode,
  onUpload,
  onInquiry,
  onChat,
  onLike,
  onCollect,
  onDelete,
  isAnalyzing,
  isLiked,
  activeItem,
  placeholder,
  isAskExpanded,
  onAskExpand,
  onAskCollapse,
}) => {
  const [inquiryText, setInquiryText] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [askText, setAskText] = useState('');
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Auto-detect mobile for capture attribute
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const handleInquirySubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (inquiryText.trim() && onInquiry) {
      onInquiry(inquiryText.trim());
      setInquiryText('');
    }
  };

  const renderCorridor = () => (
    <div className="flex items-center gap-4 p-2 bg-neutral-900/95 backdrop-blur-2xl border border-white/10 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in fade-in zoom-in duration-500">
      <button
        onClick={() => galleryInputRef.current?.click()}
        className="group relative flex items-center justify-center w-12 h-12 rounded-full text-neutral-400 hover:text-white hover:bg-white/5 transition-all active:scale-90"
        title="Library"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </button>

      <button
        onClick={() => cameraInputRef.current?.click()}
        className="group relative flex items-center justify-center w-14 h-14 rounded-full bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:scale-105 active:scale-95 transition-all"
        title="Capture Artwork"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      </button>
    </div>
  );

  const renderHall = () => (
    <div className="flex items-center gap-3 w-[min(90vw,600px)] p-2 bg-neutral-900/95 backdrop-blur-2xl border border-white/10 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-4 duration-500">
      <form 
        onSubmit={handleInquirySubmit}
        className="flex-1 relative group flex items-center"
      >
        <div className="absolute left-4 text-neutral-500 group-focus-within:text-white transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        </div>
        <input 
          type="text"
          value={inquiryText}
          onChange={(e) => setInquiryText(e.target.value)}
          placeholder={placeholder || "Ask curator..."}
          className="w-full bg-transparent py-3 pl-11 pr-4 text-[14px] text-white placeholder-neutral-500 outline-none transition-all"
        />
        {inquiryText.length > 0 && (
          <button 
            type="submit"
            className="w-8 h-8 mr-1 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        )}
      </form>

      <div className="w-px h-6 bg-white/10" />

      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 relative ${
          isExpanded ? 'bg-white text-black' : 'text-neutral-400 hover:text-white hover:bg-white/5'
        }`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-300 ${isExpanded ? 'rotate-45' : ''}`}>
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        
        {isExpanded && (
          <div className="absolute bottom-full mb-4 right-0 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
             <button
              onClick={(e) => { e.stopPropagation(); setIsExpanded(false); galleryInputRef.current?.click(); }}
              className="w-12 h-12 rounded-full bg-neutral-900 border border-white/10 shadow-2xl flex items-center justify-center text-white hover:bg-neutral-800 hover:scale-105 active:scale-95 transition-all"
              title="Add from library"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setIsExpanded(false); cameraInputRef.current?.click(); }}
              className="w-12 h-12 rounded-full bg-neutral-900 border border-white/10 shadow-2xl flex items-center justify-center text-white hover:bg-neutral-800 hover:scale-105 active:scale-95 transition-all"
              title="Capture photo"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </button>
          </div>
        )}
      </button>
    </div>
  );

  const renderInterpretation = () => {
    if (isAskExpanded) {
      return (
        <div className="flex items-center gap-3 px-4 py-3 animate-in slide-in-from-bottom-1 duration-200">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (askText.trim()) {
                onInquiry?.(askText.trim());
                setAskText('');
              }
            }}
            className="flex-1 flex items-center bg-neutral-800 rounded-full h-10 px-4"
          >
            <input
              autoFocus
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              placeholder="Ask about this artwork…"
              className="flex-1 bg-transparent text-[14px] text-white placeholder-neutral-500 outline-none"
            />
            {askText.length > 0 && (
              <button
                type="submit"
                className="w-7 h-7 rounded-full bg-white text-black flex items-center justify-center shrink-0 active:scale-95 transition-all"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            )}
          </form>
          <button
            onClick={() => { onAskCollapse?.(); setAskText(''); }}
            className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-neutral-500 hover:text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3 px-4 py-3 animate-in fade-in duration-300">
        {/* Ask input — tappable placeholder */}
        <button
          onClick={() => onAskExpand?.()}
          className="flex-1 flex items-center gap-2.5 bg-neutral-800 rounded-full h-10 px-4 text-left"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-500 shrink-0">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span className="text-[13px] text-neutral-500">Ask AI…</span>
        </button>

        <button
          onClick={onLike}
          className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-all ${isLiked ? 'text-red-400' : 'text-neutral-500 hover:text-white'}`}
          title={isLiked ? "Unlike" : "Like"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.7 0l-1.1 1.1-1.1-1.1a5.5 5.5 0 0 0-7.7 7.7l1.1 1.1 7.7 7.7 7.7-7.7 1.1-1.1a5.5 5.5 0 0 0 0-7.7z"/>
          </svg>
        </button>

        <button
          onClick={onCollect}
          className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-neutral-500 hover:text-white transition-colors"
          title="Collect"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3h18v18H3z"/><path d="M12 8v8"/><path d="M8 12h8"/>
          </svg>
        </button>

        {/* Delete hidden on mobile — accessible via "..." menu in the modal header */}
        <button
          onClick={onDelete}
          className="hidden sm:flex w-10 h-10 shrink-0 rounded-full items-center justify-center text-neutral-600 hover:text-red-400 transition-colors"
          title="Delete"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    );
  };

  const hiddenInputs = (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture={isMobile ? "environment" : undefined}
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
    </>
  );

  if (mode === 'interpretation') {
    return (
      <>
        {hiddenInputs}
        <div className="fixed bottom-0 left-0 right-0 z-[100] bg-neutral-900/98 backdrop-blur-xl border-t border-white/10 animate-in slide-in-from-bottom-2 duration-300" style={{ paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}>
          {renderInterpretation()}
        </div>
      </>
    );
  }

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[100] transition-all duration-700 ease-out"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 2.5rem)' }}
    >
      {hiddenInputs}

      {isAnalyzing && (
        <div className="absolute -top-16 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-neutral-900 border border-white/10 px-5 py-2.5 rounded-full shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
           <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
           <span className="text-[10px] tracking-[0.2em] font-bold uppercase text-white/90">Analyzing Artwork</span>
        </div>
      )}

      {mode === 'corridor' && renderCorridor()}
      {mode === 'hall' && renderHall()}
    </div>
  );
};

export default ContextualActionBar;
