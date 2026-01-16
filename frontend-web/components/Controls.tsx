
import React from 'react';
import { ViewMode } from '../types';

interface Props {
  viewMode: ViewMode;
  onToggleView: () => void;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isAnalyzing: boolean;
  isVisitActive: boolean;
  onToggleVisit: () => void;
}

const Controls: React.FC<Props> = ({ viewMode, onToggleView, onUpload, isAnalyzing, isVisitActive, onToggleVisit }) => {
  return (
    <div className="fixed bottom-12 left-1/2 -translate-x-1/2 flex items-center space-x-6 z-30">
      {/* Visit Toggle */}
      <button 
        onClick={onToggleVisit}
        className={`
          group relative w-12 h-12 rounded-full border flex items-center justify-center transition-all duration-500
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
      <label
        onClick={() => console.log('Upload label clicked')}
        className={`
        group relative w-16 h-16 rounded-full flex items-center justify-center cursor-pointer transition-all duration-500
        ${isAnalyzing ? 'bg-neutral-100' : 'bg-neutral-900 hover:scale-110 shadow-xl'}
      `}>
        <input
          type="file"
          className="hidden"
          accept="image/*"
          onChange={(e) => {
            console.log('File input onChange fired', e.target.files);
            onUpload(e);
          }}
          disabled={isAnalyzing}
          multiple
        />
        {isAnalyzing ? (
          <div className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin"></div>
        ) : (
          <span className="text-white text-3xl font-thin transition-transform duration-500 group-hover:rotate-90">+</span>
        )}
        
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-black text-white text-[8px] px-3 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap tracking-widest uppercase">
          Add Piece
        </div>
      </label>

      {/* View Toggle */}
      <button 
        onClick={onToggleView}
        className={`
          group relative w-12 h-12 rounded-full border border-neutral-200 flex items-center justify-center transition-all duration-500
          ${viewMode === ViewMode.TOPOGRAPHY ? 'bg-neutral-900 border-neutral-900' : 'bg-white hover:bg-neutral-50'}
        `}
      >
        <svg 
          width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={viewMode === ViewMode.TOPOGRAPHY ? "white" : "currentColor"} 
          strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
        >
          {viewMode === ViewMode.CORRIDOR ? (
            <path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" />
          ) : (
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          )}
        </svg>

        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-black text-white text-[8px] px-3 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap tracking-widest uppercase">
          {viewMode === ViewMode.CORRIDOR ? 'Topography' : 'Corridor'}
        </div>
      </button>
    </div>
  );
};

export default Controls;
