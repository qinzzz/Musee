
import React, { useRef, useState } from 'react';

interface Props {
  onUpload: (e: React.ChangeEvent<HTMLInputElement>, mode: 'gallery' | 'camera') => void;
  isAnalyzing: boolean;
  isVisitActive: boolean;
  onToggleVisit: () => void;
}

const Controls: React.FC<Props> = ({ onUpload, isAnalyzing, isVisitActive, onToggleVisit }) => {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);

  const handleGalleryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    onUpload(e, 'gallery');
    e.target.value = '';
  };

  const handleCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    onUpload(e, 'camera');
    e.target.value = '';
  };

  const handleFabClick = () => {
    if (isAnalyzing) return;
    if (!open) {
      // First click: expand menu
      setOpen(true);
    } else {
      // Second click (expanded): open camera and collapse
      setOpen(false);
      cameraInputRef.current?.click();
    }
  };

  const handleVisit = () => {
    setOpen(false);
    onToggleVisit();
    if (!isVisitActive) cameraInputRef.current?.click();
  };

  return (
    <div
      className="fixed z-30 flex flex-col items-end gap-3"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)', right: '1.25rem' }}
    >
      {/* Hidden file inputs */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCameraChange} disabled={isAnalyzing} />
      <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryChange} disabled={isAnalyzing} />

      {/* Tap-outside backdrop */}
      {open && <div className="fixed inset-0 z-[-1]" onClick={() => setOpen(false)} />}

      {/* Expanded sub-actions — slide up when open */}
      <div className={`flex flex-col items-center gap-3 transition-all duration-200 ${open ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-3 pointer-events-none'}`}>

        {/* Visit */}
        <button
          onClick={handleVisit}
          disabled={isAnalyzing}
          aria-label={isVisitActive ? 'End visit' : 'Start visit'}
          className={`relative w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95 ${isVisitActive ? 'bg-emerald-500 text-white' : 'bg-white text-neutral-600 border border-neutral-200'}`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
          {isVisitActive && (
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-300 rounded-full border-2 border-white animate-pulse" />
          )}
        </button>

        {/* Import */}
        <button
          onClick={() => { setOpen(false); galleryInputRef.current?.click(); }}
          disabled={isAnalyzing}
          aria-label="Import from gallery"
          className="w-12 h-12 rounded-full bg-white border border-neutral-200 shadow-lg flex items-center justify-center text-neutral-600 transition-all active:scale-95"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </button>

      </div>

      {/* Main FAB */}
      <button
        onClick={handleFabClick}
        aria-label={open ? 'Take photo' : 'Open actions'}
        className={`w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-200 active:scale-95 ${isAnalyzing ? 'opacity-60 pointer-events-none' : ''} ${isVisitActive ? 'bg-emerald-500 text-white' : 'bg-neutral-900 text-white'}`}
      >
        {isAnalyzing ? (
          <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : (
          <svg
            width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }}
          >
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        )}
      </button>

    </div>
  );
};

export default Controls;
