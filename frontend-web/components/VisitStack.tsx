
import React from 'react';
import { GalleryItem } from '../types';

interface Props {
  items: GalleryItem[];
  onOpenExhibition: (items: GalleryItem[]) => void;
  onResumeVisit?: (source: 'camera' | 'album') => void;
  onDeleteItem?: (id: string) => void;
  onDeleteSession?: () => void;
}

const VisitStack: React.FC<Props> = ({ items, onOpenExhibition, onResumeVisit, onDeleteItem, onDeleteSession }) => {
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
      className="min-w-[40vw] h-[80vh] mx-12 flex items-center justify-center transition-all duration-1000 group cursor-pointer"
      onClick={() => onOpenExhibition(items)}
    >
      <div className="relative w-full h-full flex items-center justify-center">
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
              className="absolute transition-all duration-700 shadow-2xl overflow-hidden group-hover:scale-105 max-w-[80vw]"
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
                className="max-h-[50vh] max-w-full w-auto object-contain"
              />
            </div>
          );
        })}

        {/* Info Overlay */}
        <div className="absolute z-20 flex flex-col items-center translate-y-[32vh]">
          <div className="flex items-center">
            <div
              className="bg-neutral-900 text-white px-6 py-2 rounded-full shadow-2xl border border-white/10 flex items-center space-x-3 group-hover:scale-105 transition-transform"
              onClick={(e) => {
                e.stopPropagation();
                onOpenExhibition(items);
              }}
            >
              <span className="text-[10px] tracking-[0.4em] uppercase font-bold">Visit Record</span>
              <span className="w-px h-3 bg-white/20"></span>
              <span className="text-[10px] tracking-widest text-emerald-400 font-mono">{count} PIECES</span>
            </div>

            {onResumeVisit && (
              <div className="relative">
                <button
                  className="bg-emerald-500 text-white rounded-full shadow-2xl border border-emerald-400/20 flex items-center whitespace-nowrap overflow-hidden transition-all duration-500 ease-out max-w-0 opacity-0 p-0 group-hover:max-w-[200px] group-hover:opacity-100 group-hover:px-6 group-hover:py-2 group-hover:ml-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowResumeMenu(!showResumeMenu);
                  }}
                >
                  <span className="text-[10px] tracking-[0.4em] uppercase font-bold">Resume</span>
                </button>

                {showResumeMenu && (
                  <div className="absolute bottom-full left-2 mb-4 bg-white rounded-2xl shadow-2xl border border-neutral-100 p-2 flex flex-col space-y-1 animate-in slide-in-from-bottom-2 duration-300 z-50 min-w-[180px]">
                    <button
                      className="flex items-center space-x-3 px-4 py-3 hover:bg-neutral-50 rounded-xl transition-colors text-neutral-600 hover:text-emerald-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        onResumeVisit('camera');
                        setShowResumeMenu(false);
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                      <span className="text-[10px] tracking-widest uppercase font-bold">Take a photo</span>
                    </button>
                    <div className="h-px bg-neutral-50 mx-2"></div>
                    <button
                      className="flex items-center space-x-3 px-4 py-3 hover:bg-neutral-50 rounded-xl transition-colors text-neutral-600 hover:text-emerald-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        onResumeVisit('album');
                        setShowResumeMenu(false);
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                      <span className="text-[10px] tracking-widest uppercase font-bold">Upload from album</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {onDeleteSession && (
              <button
                className="bg-red-500/10 backdrop-blur text-red-500 rounded-full shadow-2xl border border-red-500/20 flex items-center whitespace-nowrap overflow-hidden transition-all duration-500 ease-out max-w-0 opacity-0 p-0 group-hover:max-w-[200px] group-hover:opacity-100 group-hover:px-4 group-hover:py-2 group-hover:ml-2 hover:bg-red-500 hover:text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession();
                }}
                title="Delete Visit Record"
              >
                <span className="text-[10px] font-bold">✕</span>
              </button>
            )}
          </div>
          <p className="mt-4 text-[9px] tracking-[0.2em] text-neutral-400 uppercase font-light">Tap to re-enter exhibition hall</p>
        </div>
      </div>
    </div>
  );
};

export default VisitStack;
