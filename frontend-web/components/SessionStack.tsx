
import React from 'react';
import InteractionOverlay from './InteractionOverlay';
import { GalleryItem } from '../types';

interface Props {
  items: GalleryItem[];
  onOpenExhibition: (items: GalleryItem[]) => void;
  onResumeVisit?: (source: 'camera' | 'album') => void;
  onDeleteItem?: (id: string) => void;
  onDeleteSession?: () => void;
  onInterpret?: (item: GalleryItem) => void;
  isActive?: boolean;
}

const SessionStack: React.FC<Props> = ({ items, onOpenExhibition, onResumeVisit, onDeleteItem, onDeleteSession, onInterpret, isActive }) => {
  if (items.length === 0) return null;

  // We show up to 3 cards in the stack visually
  const displayItems = items.slice(-3).reverse();
  const count = items.length;

  // Find first non-empty location and time
  const locationItem = items.find(i => i.location);
  const locationStr = locationItem?.location;
  const timeStr = items.find(i => i.photoTime)?.photoTime;

  const displayLocation = React.useMemo(() => {
    if (!locationStr) return null;
    // A plain string that looks like serialized JSON must never be shown as-is.
    const plainString =
      typeof locationStr === 'string' && !locationStr.trim().startsWith('{') ? locationStr : null;
    try {
      let data: any = null;
      if (typeof locationStr === 'object') {
        data = locationStr;
      } else if (typeof locationStr === 'string' && locationStr.trim().startsWith('{')) {
        data = JSON.parse(locationStr);
      }

      if (data) {
        const parts = [];
        if (data.museum) parts.push(data.museum);
        if (data.city) parts.push(data.city);
        if (!data.city && data.country) parts.push(data.country);
        if (data.city && data.country && !data.museum) parts.push(data.country);

        return parts.length > 0 ? parts.join(', ') : null;
      }
      return plainString;
    } catch (e) {
      return plainString;
    }
  }, [locationStr]);

  return (
    <div
      className="h-full min-w-[280px] sm:min-w-[320px] flex items-center justify-center transition-all duration-500 group cursor-pointer hover:scale-[1.02]"
    >
      <div
        className="relative flex items-center justify-center"
        onClick={() => onOpenExhibition(items)}
      >
        {displayItems.map((item, idx) => {
          const rotation = (idx - (displayItems.length - 1) / 2) * 5;

          return (
            <div
              key={item.id}
              className={`${idx === 0 ? 'relative' : 'absolute'} transition-all duration-700 max-w-[80vw]`}
              style={{
                transform: `rotate(${rotation}deg)`,
                zIndex: displayItems.length - idx,
                opacity: 1 - (idx * 0.25)
              }}
            >
              <img
                src={item.url}
                alt="Stacked item"
                className="max-h-[52dvh] sm:max-h-[50vh] max-w-full w-auto object-contain transition-all duration-700 rounded-[8px]"
                style={{ filter: isActive ? 'none' : 'saturate(0.1)' }}
              />
            </div>
          );
        })}

        {/* Center Interaction Overlay */}
        <InteractionOverlay
          isVisible={true}
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"
          secondaryText="View"
          buttons={[]}
        />

        {/* Floating Resume Menu */}

      </div>


      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
        <span className="text-[7px] tracking-[0.3em] uppercase font-bold text-neutral-400 flex items-center gap-2">
          {items.some(i => i.isAnalyzing) && (
            <span className="flex items-center gap-1.5 text-emerald-500">
              <span className="w-1 h-1 bg-current rounded-full animate-pulse" />
              <span>Analyzing</span>
              <span className="text-neutral-200">—</span>
            </span>
          )}
          {count} {count === 1 ? 'Piece' : 'Pieces'}
        </span>
      </div>
    </div>
  );
};

export default SessionStack;
