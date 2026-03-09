
import React, { useRef } from 'react';

interface Props {
  onUpload: (e: React.ChangeEvent<HTMLInputElement>, mode: 'gallery' | 'camera') => void;
  isAnalyzing: boolean;
  isVisitActive: boolean;
  onToggleVisit: () => void;
}

const Controls: React.FC<Props> = ({ onUpload, isAnalyzing, isVisitActive, onToggleVisit }) => {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleImport = () => {
    if (isAnalyzing) return;
    galleryInputRef.current?.click();
  };

  const handlePhoto = () => {
    if (isAnalyzing) return;
    cameraInputRef.current?.click();
  };

  const handleVisit = () => {
    if (isAnalyzing) return;
    if (isVisitActive) {
      // End the visit
      onToggleVisit();
    } else {
      // Start visit AND open camera
      onToggleVisit();
      cameraInputRef.current?.click();
    }
  };

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-30"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
    >
      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCameraChange}
        disabled={isAnalyzing}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleGalleryChange}
        disabled={isAnalyzing}
      />

      {/* 3-button rail */}
      <div className={`flex items-stretch bg-white/95 backdrop-blur-md border border-neutral-200 rounded-full shadow-xl overflow-hidden transition-opacity duration-300 ${isAnalyzing ? 'opacity-60 pointer-events-none' : ''}`}>

        {/* Import */}
        <button
          onClick={handleImport}
          className="flex flex-col items-center justify-center gap-1 px-6 py-3 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
          aria-label="Import from gallery"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-500">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span className="text-[9px] tracking-[0.15em] uppercase text-neutral-400 font-medium">Import</span>
        </button>

        {/* Divider */}
        <div className="w-px self-stretch bg-neutral-100 my-2" />

        {/* Photo — primary action: minimal "+" */}
        <button
          onClick={handlePhoto}
          className="flex items-center justify-center px-6 py-3 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
          aria-label="Take a photo"
        >
          {isAnalyzing ? (
            <div className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-neutral-900">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          )}
        </button>

        {/* Divider */}
        <div className="w-px self-stretch bg-neutral-100 my-2" />

        {/* Visit */}
        <button
          onClick={handleVisit}
          className={`relative flex flex-col items-center justify-center gap-1 px-6 py-3 transition-colors ${
            isVisitActive
              ? 'hover:bg-emerald-50 active:bg-emerald-100'
              : 'hover:bg-neutral-50 active:bg-neutral-100'
          }`}
          aria-label={isVisitActive ? 'End visit' : 'Start visit'}
        >
          <div className="relative">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={isVisitActive ? 'text-emerald-600' : 'text-neutral-500'}>
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
            {isVisitActive && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full border border-white animate-pulse" />
            )}
          </div>
          <span className={`text-[9px] tracking-[0.15em] uppercase font-medium ${isVisitActive ? 'text-emerald-600' : 'text-neutral-400'}`}>
            {isVisitActive ? 'End' : 'Visit'}
          </span>
        </button>

      </div>
    </div>
  );
};

export default Controls;
