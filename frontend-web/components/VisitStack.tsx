
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
}

const VisitStack: React.FC<Props> = ({ items, onOpenExhibition, onResumeVisit, onDeleteItem, onDeleteSession, onInterpret }) => {
  const [showResumeMenu, setShowResumeMenu] = React.useState(false);
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
    try {
      let data: any = null;
      if (typeof locationStr === 'object') {
        data = locationStr;
      } else if (typeof locationStr === 'string' && locationStr.startsWith('{')) {
        data = JSON.parse(locationStr);
      }

      if (data) {
        const parts = [];
        if (data.museum) parts.push(data.museum);
        if (data.city) parts.push(data.city);
        if (!data.city && data.country) parts.push(data.country);
        if (data.city && data.country && !data.museum) parts.push(data.country);

        return parts.join(', ');
      }
      return typeof locationStr === 'string' ? locationStr : null;
    } catch (e) {
      return typeof locationStr === 'string' ? locationStr : null;
    }
  }, [locationStr]);

  return (
    <div
      className="min-w-[85vw] sm:min-w-[40vw] h-[80vh] mx-3 sm:mx-12 flex items-center justify-center transition-all duration-500 group cursor-pointer hover:scale-[1.02]"
    >
      <div
        className="relative w-full h-full flex items-center justify-center"
        onClick={() => onInterpret?.(items[0])}
      >
        {/* Location and Date Metadata (Above) */}
        {(displayLocation || timeStr) && (
          <div className="absolute z-20 flex flex-col items-center -translate-y-[32vh] opacity-0 group-hover:opacity-100 transition-opacity duration-700 transform translate-y-[-28vh] group-hover:-translate-y-[32vh]">
            {displayLocation && (
              <h3 className="text-lg font-serif text-neutral-800 mb-2 whitespace-nowrap bg-white/80 px-4 py-1 rounded-full backdrop-blur-sm shadow-sm">
                {displayLocation}
              </h3>
            )}
            {timeStr && (
              <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-light bg-white/50 px-3 py-1 rounded-full backdrop-blur-sm">
                {timeStr}
              </p>
            )}
          </div>
        )}

        {displayItems.map((item, idx) => {
          const rotation = (idx - (displayItems.length - 1) / 2) * 5;
          const offset = idx * 12;

          return (
            <div
              key={item.id}
              className="absolute transition-all duration-700 shadow-2xl overflow-hidden max-w-[80vw]"
              style={{
                backgroundColor: item.vibe.backgroundColor,
                padding: `clamp(${item.vibe.padding * 3}px, ${item.vibe.padding * 1.2}vw, ${item.vibe.padding * 10}px)`,
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
                className="max-h-[60vh] sm:max-h-[50vh] max-w-full w-auto object-contain"
              />
            </div>
          );
        })}

        {/* Center Interaction Overlay */}
        <InteractionOverlay
          isVisible={true} // Controlled by group-hover visibility in CSS
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"
          secondaryText="Tap to re-enter exhibition hall"
          buttons={[
            {
              label: 'Visit Record',
              primary: true,
              onClick: (e) => {
                e.stopPropagation();
                onOpenExhibition(items);
              }
            },
            ...(onResumeVisit ? [{
              label: 'Continue the Visit',
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                setShowResumeMenu(!showResumeMenu);
              }
            }] : [])
          ]}
        />

        {/* Floating Resume Menu */}
        {showResumeMenu && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-4 bg-white rounded-xl shadow-2xl border border-neutral-100 p-1 flex items-center space-x-0.5 animate-in zoom-in-95 duration-300 z-50">
            <button
              className="flex items-center space-x-1.5 px-2.5 py-1.5 hover:bg-neutral-50 rounded-lg transition-colors text-neutral-600 hover:text-emerald-600"
              onClick={(e) => {
                e.stopPropagation();
                onResumeVisit?.('camera');
                setShowResumeMenu(false);
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
              <span className="text-[8px] tracking-widest uppercase font-bold">Photo</span>
            </button>
            <div className="w-px h-4 bg-neutral-100"></div>
            <button
              className="flex items-center space-x-1.5 px-2.5 py-1.5 hover:bg-neutral-50 rounded-lg transition-colors text-neutral-600 hover:text-emerald-600"
              onClick={(e) => {
                e.stopPropagation();
                onResumeVisit?.('album');
                setShowResumeMenu(false);
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              <span className="text-[8px] tracking-widest uppercase font-bold">Upload</span>
            </button>
          </div>
        )}

      </div>


      <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
        <span className="text-[7px] tracking-[0.3em] uppercase font-bold text-neutral-400">
          {count} {count === 1 ? 'Piece' : 'Pieces'}
        </span>
      </div>
    </div>
  );
};

export default VisitStack;
