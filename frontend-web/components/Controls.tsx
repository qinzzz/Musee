
import React, { useState, useRef, useEffect } from 'react';
interface Props {
  activeLayout: 'gallery' | 'grid' | 'album';
  onChangeLayout: (view: 'gallery' | 'grid' | 'album') => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isAnalyzing: boolean;
  isVisitActive: boolean;
  onToggleVisit: () => void;
}

const Controls: React.FC<Props> = ({
  activeLayout,
  onChangeLayout,
  onUpload,
  isAnalyzing,
  isVisitActive,
  onToggleVisit
}) => {
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const uploadControlRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isAnalyzing) setShowUploadMenu(false);
  }, [isAnalyzing]);

  useEffect(() => {
    if (!showUploadMenu) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!uploadControlRef.current) return;
      if (!uploadControlRef.current.contains(event.target as Node)) {
        setShowUploadMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUploadMenu]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    onUpload(e);
    e.target.value = '';
  };

  const triggerCameraCapture = () => {
    if (isAnalyzing) return;
    cameraInputRef.current?.click();
    setShowUploadMenu(false);
  };

  const triggerGalleryImport = () => {
    if (isAnalyzing) return;
    galleryInputRef.current?.click();
    setShowUploadMenu(false);
  };

  const toggleUploadMenu = () => {
    if (isAnalyzing) return;
    setShowUploadMenu(prev => !prev);
  };

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 flex items-center space-x-3 sm:space-x-6 z-30"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
    >
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
        disabled={isAnalyzing}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
        disabled={isAnalyzing}
        multiple
      />

      {/* Visit Toggle */}
      <button
        onClick={onToggleVisit}
        className={`
          group relative w-8 h-8 sm:w-12 sm:h-12 rounded-full border flex items-center justify-center transition-all duration-500
          ${isVisitActive ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-neutral-200 text-neutral-400 hover:bg-neutral-50'}
        `}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-black text-white text-[8px] px-3 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap tracking-widest uppercase">
          {isVisitActive ? 'End Visit' : 'Start Visit'}
        </div>
        {isVisitActive && <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white animate-pulse"></span>}
      </button>

      {/* Upload Button */}
      <div className="relative" ref={uploadControlRef}>
        <button
          onClick={toggleUploadMenu}
          disabled={isAnalyzing}
          className={`
            group relative w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-500
            ${isAnalyzing ? 'bg-neutral-100 cursor-not-allowed' : 'bg-neutral-900 hover:scale-110 shadow-xl'}
          `}
        >
          {isAnalyzing ? (
            <div className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <span className="text-white text-3xl font-thin transition-transform duration-500 group-hover:rotate-90">+</span>
          )}
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-black text-white text-[8px] px-3 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap tracking-widest uppercase">
            Add Piece
          </div>
        </button>
        {showUploadMenu && !isAnalyzing && (
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 flex flex-col bg-white shadow-2xl rounded-2xl border border-neutral-100 p-2 w-36">
            <button
              onClick={triggerCameraCapture}
              className="text-xs font-medium px-3 py-2 rounded-xl text-left hover:bg-neutral-50 transition-colors"
            >
              Take Photo
              <span className="block text-[10px] text-neutral-400 tracking-wide">Use camera</span>
            </button>
            <button
              onClick={triggerGalleryImport}
              className="text-xs font-medium px-3 py-2 rounded-xl text-left hover:bg-neutral-50 transition-colors"
            >
              Import
              <span className="block text-[10px] text-neutral-400 tracking-wide">From album</span>
            </button>
          </div>
        )}
      </div>

      {/* Layout View Rail — corridor / grid / album */}
      <div className="flex items-center space-x-1 bg-white/90 backdrop-blur-md border border-neutral-200 rounded-full px-2 py-1 shadow-lg">
        {/* Corridor view */}
        <button
          onClick={() => onChangeLayout('gallery')}
          aria-label="Corridor"
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-colors ${
            activeLayout === 'gallery' ? 'bg-neutral-900 text-white' : 'text-neutral-400 hover:text-neutral-700'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="6" width="4" height="12" rx="1" /><rect x="10" y="3" width="4" height="18" rx="1" /><rect x="17" y="6" width="4" height="12" rx="1" />
          </svg>
        </button>

        {/* Grid view */}
        <button
          onClick={() => onChangeLayout('grid')}
          aria-label="Grid"
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-colors ${
            activeLayout === 'grid' ? 'bg-neutral-900 text-white' : 'text-neutral-400 hover:text-neutral-700'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={activeLayout === 'grid' ? 'white' : 'currentColor'} stroke="none">
            <circle cx="4.5" cy="4.5" r="2" /><circle cx="12" cy="4.5" r="2" /><circle cx="19.5" cy="4.5" r="2" />
            <circle cx="4.5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19.5" cy="12" r="2" />
            <circle cx="4.5" cy="19.5" r="2" /><circle cx="12" cy="19.5" r="2" /><circle cx="19.5" cy="19.5" r="2" />
          </svg>
        </button>

        {/* Album view */}
        <button
          onClick={() => onChangeLayout('album')}
          aria-label="Albums"
          className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-colors ${
            activeLayout === 'album' ? 'bg-neutral-900 text-white' : 'text-neutral-400 hover:text-neutral-700'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 5h18" /><rect x="3" y="9" width="7" height="6" rx="1" /><rect x="12" y="9" width="4" height="6" rx="1" /><rect x="18" y="9" width="3" height="6" rx="1" /><path d="M3 18h18" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default Controls;
