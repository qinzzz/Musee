
import React from 'react';
import { GalleryItem } from '../types';

interface Props {
  items: GalleryItem[];
  onOpenExhibition: (items: GalleryItem[]) => void;
}

const VisitStack: React.FC<Props> = ({ items, onOpenExhibition }) => {
  if (items.length === 0) return null;

  // We show up to 3 cards in the stack visually
  const displayItems = items.slice(-3).reverse();
  const count = items.length;

  return (
    <div 
      className="min-w-[40vw] h-[80vh] mx-12 flex items-center justify-center transition-all duration-1000 group cursor-pointer"
      onClick={() => onOpenExhibition(items)}
    >
      <div className="relative w-full h-full flex items-center justify-center">
        {displayItems.map((item, idx) => {
          const rotation = (idx - (displayItems.length - 1) / 2) * 5;
          const offset = idx * 12;
          
          return (
            <div 
              key={item.id}
              className="absolute transition-all duration-700 shadow-2xl overflow-hidden group-hover:scale-105"
              style={{
                backgroundColor: item.vibe.backgroundColor,
                padding: `${item.vibe.padding * 10}px`,
                borderRadius: item.vibe.borderRadius,
                border: `1px solid ${item.vibe.accentColor}22`,
                transform: `rotate(${rotation}deg) translate(${offset}px, ${-offset}px)`,
                zIndex: displayItems.length - idx,
                opacity: 1 - (idx * 0.2)
              }}
            >
              <img 
                src={item.url} 
                alt="Stacked item"
                className="max-h-[50vh] object-contain"
              />
            </div>
          );
        })}

        {/* Info Overlay */}
        <div className="absolute z-20 flex flex-col items-center translate-y-[32vh] opacity-100 group-hover:scale-110 transition-transform">
          <div className="bg-neutral-900 text-white px-6 py-2 rounded-full shadow-2xl border border-white/10 flex items-center space-x-3">
             <span className="text-[10px] tracking-[0.4em] uppercase font-bold">Visit Record</span>
             <span className="w-px h-3 bg-white/20"></span>
             <span className="text-[10px] tracking-widest text-emerald-400 font-mono">{count} PIECES</span>
          </div>
          <p className="mt-4 text-[9px] tracking-[0.2em] text-neutral-400 uppercase font-light">Tap to re-enter exhibition hall</p>
        </div>
      </div>
    </div>
  );
};

export default VisitStack;
