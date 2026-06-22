
import React from 'react';
import { GalleryItem } from '../types';
import InteractionOverlay from './InteractionOverlay';

interface Props {
  item: GalleryItem;
  isActive: boolean;
  onInterpret: () => void;
  onContinueVision?: () => void;
  onDelete?: () => void;
  onRetry?: () => void;
  size?: 'normal' | 'large';
}

const GalleryCard: React.FC<Props> = ({ item, isActive, onInterpret, onDelete, onRetry, size = 'normal' }) => {
  const { url } = item;
  const isPendingDelete = item.deleteStatus === 'pending';

  return (
    <div
      className={`relative h-full min-w-[200px] flex items-center justify-center transition-all duration-500 group ${isPendingDelete ? 'cursor-default opacity-45' : 'cursor-pointer hover:scale-[1.01]'} ${size === 'large' ? 'p-8 sm:p-12' : 'p-4'}`}
      onClick={() => {
        if (isPendingDelete) return;
        onInterpret();
      }}
    >
      {/* Image — natural aspect ratio, fills strip height */}
      <img
        src={url}
        alt=""
        className={`${
          size === 'large' ? 'max-h-[65vh] sm:max-h-[60vh]' : 'max-h-[52dvh] sm:max-h-[50vh]'
        } w-auto object-contain block max-w-[80vw] transition-all duration-700 mx-auto rounded-[8px] shadow-2xl`}
        style={{ 
          filter: isPendingDelete ? 'saturate(0.7)' : (isActive ? 'none' : size === 'large' ? 'saturate(0.4) blur(1px)' : 'saturate(0.1)'),
          opacity: isActive ? 1 : size === 'large' ? 0.6 : 1
        }}
      />
 
      {/* No more white fade overlay for inactive — keeping it clean with saturation only */}

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
      {!item.isAnalyzing && item.analysisStatus === 'failed' && item.streamingText && (
        <div className="absolute bottom-0 left-0 right-0 bg-neutral-900/90 text-white py-2 px-3 z-20 flex items-center justify-between gap-2">
          <p className="text-[9px] tracking-wider uppercase font-bold">Analysis failed</p>
          {onRetry && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRetry(); }}
              className="text-[9px] tracking-wider uppercase font-bold bg-white/20 hover:bg-white/30 px-2 py-1 rounded transition-colors shrink-0"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Hover overlay */}
      {!item.isAnalyzing && !isPendingDelete && (
        <InteractionOverlay
          isVisible={true}
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"
          secondaryText="View"
          buttons={[]}
        />
      )}

      {/* Delete button — only on active, reveals on hover */}
      {onDelete && isActive && !isPendingDelete && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
          className={`absolute w-8 h-8 rounded-full bg-white/90 hover:bg-white text-neutral-400 hover:text-neutral-900 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 z-30 border border-neutral-200 shadow-xl ${
            size === 'large' ? 'top-10 right-10' : 'top-3 right-3'
          }`}
          title="Remove"
        >
          <span className="text-sm leading-none">✕</span>
        </button>
      )}
    </div>
  );
};

export default GalleryCard;
