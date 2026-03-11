
import React from 'react';
import { GalleryItem } from '../types';

interface Props {
  item: GalleryItem;
  isActive: boolean;
  onInterpret: () => void;
  onContinueVision?: () => void;
  onDelete?: () => void;
}

const GalleryCard: React.FC<Props> = ({ item, isActive, onInterpret, onDelete }) => {
  const { url } = item;

  return (
    <div
      className="relative h-full group cursor-pointer shrink-0"
      onClick={onInterpret}
    >
      {/* Image — natural aspect ratio, fills strip height */}
      <img
        src={url}
        alt=""
        className="h-full w-auto object-cover block max-w-[70vw] transition-all duration-700"
        style={{ filter: isActive ? 'none' : 'saturate(0.1)' }}
      />
 
      {/* White fade overlay for inactive */}
      {!isActive && (
        <div className="absolute inset-0 bg-white/70 transition-all duration-700 pointer-events-none" />
      )}

      {/* Loading state */}
      {item.isAnalyzing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-20">
          <div className="relative mb-3">
            <div className="w-8 h-8 border-2 border-neutral-100 rounded-full" />
            <div className="absolute inset-0 w-8 h-8 border-t-2 border-neutral-700 rounded-full animate-spin" />
          </div>
          <p className="text-[9px] tracking-[0.35em] uppercase text-neutral-500 animate-pulse">Analyzing</p>
        </div>
      )}

      {/* Error state */}
      {!item.isAnalyzing && item.streamingText && !item.artistName && (
        <div className="absolute bottom-0 left-0 right-0 bg-neutral-900/90 text-white py-2 px-3 z-20">
          <p className="text-[9px] tracking-wider uppercase font-bold">Analysis failed</p>
        </div>
      )}

      {/* Delete button — only on active, reveals on hover */}
      {onDelete && isActive && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/90 hover:bg-white text-neutral-400 hover:text-neutral-900 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 z-30 border border-neutral-200 shadow-sm"
          title="Remove"
        >
          <span className="text-xs leading-none">✕</span>
        </button>
      )}
    </div>
  );
};

export default GalleryCard;
