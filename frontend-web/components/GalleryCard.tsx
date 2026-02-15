
import React from 'react';
import InteractionOverlay from './InteractionOverlay';
import { GalleryItem } from '../types';

interface Props {
  item: GalleryItem;
  onInterpret: () => void;
  onContinueVision?: () => void;
  onDelete?: () => void;
}

const GalleryCard: React.FC<Props> = ({ item, onInterpret, onContinueVision, onDelete }) => {
  const { vibe, url, keywords } = item;
  const [imageWidth, setImageWidth] = React.useState<number>(0);
  const imageRef = React.useRef<HTMLImageElement>(null);

  const handleImageLoad = () => {
    if (imageRef.current) {
      setImageWidth(imageRef.current.offsetWidth);
    }
  };

  // Helper to parse location string (which might be JSON) or object
  const displayLocation = React.useMemo(() => {
    if (!item.location) return null;
    console.log('GalleryCard location:', item.location);
    try {
      let data: any = null;
      if (typeof item.location === 'object') {
        data = item.location;
      } else if (typeof item.location === 'string' && item.location.startsWith('{')) {
        data = JSON.parse(item.location);
      }

      if (data) {
        const parts = [];
        if (data.museum) parts.push(data.museum);
        if (data.city) parts.push(data.city);
        if (!data.city && data.country) parts.push(data.country);
        if (data.city && data.country && !data.museum) parts.push(data.country);

        return parts.join(', ');
      }
      return typeof item.location === 'string' ? item.location : null;
    } catch (e) {
      console.warn('Failed to parse location:', e);
      return typeof item.location === 'string' ? item.location : null;
    }
  }, [item.location]);

  // Helper to format date strings to (Month Day, Year) without time
  const formatDisplayDate = (dateStr: string | null | undefined): string | null => {
    if (!dateStr) return null;
    try {
      // Handle ISO format (e.g. "2025-11-25T00:00:00")
      if (dateStr.includes('T')) {
        const dt = new Date(dateStr);
        if (!isNaN(dt.getTime())) {
          return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        }
      }

      // If it has a comma followed by time, split it
      if (dateStr.includes(', ')) {
        const parts = dateStr.split(', ');
        if (parts.length >= 3) return `${parts[0]}, ${parts[1]}`;
      }

      // If it has a space followed by time
      if (dateStr.includes(' ')) {
        const parts = dateStr.split(' ');
        if (parts[0].includes('-')) {
          const dt = new Date(dateStr);
          if (!isNaN(dt.getTime())) {
            return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          }
        }
        if (parts.length >= 3 && parts[1].endsWith(',')) {
          return `${parts[0]} ${parts[1]} ${parts[2]}`;
        }
      }

      const dt = new Date(dateStr);
      if (!isNaN(dt.getTime())) {
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }

      return dateStr;
    } catch (e) {
      return dateStr;
    }
  };

  return (
    <div
      className="min-w-[85vw] sm:min-w-[40vw] h-[65vh] sm:h-[80vh] mt-16 sm:mt-0 mx-3 sm:mx-12 flex items-center justify-center transition-all duration-500 group hover:scale-[1.02]"
      style={{ backgroundColor: 'transparent' }}
    >
      <div className="flex flex-col items-center max-w-full">
        {/* Location and Date Metadata */}
        {(item.location || item.photoTime) && (
          <div className="mb-4 sm:mb-6 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-700 transform translate-y-4 group-hover:translate-y-0">
            {displayLocation && (
              <h3 className="text-base sm:text-lg font-serif text-neutral-800 mb-2 whitespace-nowrap">
                {displayLocation}
              </h3>
            )}
            {item.photoTime && (
              <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-light">
                {formatDisplayDate(item.photoTime)}
              </p>
            )}
          </div>
        )}

        {/* Card frame - hugs the image */}
        <div
          className="relative transition-all duration-700 shadow-2xl max-w-[92vw] sm:max-w-[85vw] group/img"
          style={{
            backgroundColor: vibe.backgroundColor,
            padding: `clamp(${vibe.padding * 3}px, ${vibe.padding * 1.5}vw, ${vibe.padding * 12}px)`,
            borderRadius: vibe.borderRadius,
            border: `1px solid ${vibe.accentColor}22`
          }}
        >
          <div
            className="relative overflow-hidden cursor-pointer"
            style={{ borderRadius: vibe.borderRadius }}
            onClick={onInterpret}
          >
            <img
              ref={imageRef}
              src={url}
              alt="Gallery item"
              onLoad={handleImageLoad}
              className={`h-[38vh] w-[38vh] sm:h-[50vh] sm:w-[50vh] block transition-all duration-700 object-cover ${item.isAnalyzing ? 'blur-md opacity-60 scale-95' : ''
                }`}
            />

            {/* Loading Indicator for Batch Analysis */}
            {item.isAnalyzing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/10 backdrop-blur-sm z-20">
                <div className="relative mb-4">
                  <div className="w-12 h-12 border-4 border-neutral-100/30 rounded-full"></div>
                  <div className="absolute inset-0 w-12 h-12 border-t-4 border-neutral-800 rounded-full animate-spin"></div>
                </div>
                <p className="text-[10px] tracking-[0.4em] uppercase font-bold text-neutral-800 animate-pulse">
                  Analyzing Piece
                </p>
              </div>
            )}

            {/* Error state: analysis failed (e.g. quota, rate limit) */}
            {!item.isAnalyzing && item.streamingText && !item.artistName && (
              <div className="absolute bottom-0 left-0 right-0 bg-red-900/90 text-white py-2 px-3 z-20">
                <p className="text-[9px] tracking-wider uppercase font-bold">Analysis failed</p>
                <p className="text-[10px] text-red-100 truncate" title={item.streamingText}>{item.streamingText}</p>
              </div>
            )}

            {!item.isAnalyzing && (
              <InteractionOverlay
                isVisible={true} // Visibility is handled by the parent group-hover/img:opacity-100 logic or CSS
                className="opacity-0 group-hover/img:opacity-100 transition-opacity duration-500"
                buttons={[
                  {
                    label: 'Consult Curator',
                    primary: true,
                    onClick: (e) => {
                      e.stopPropagation();
                      onInterpret();
                    }
                  },
                  ...(onContinueVision ? [{
                    label: 'Continue the Visit',
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      onContinueVision();
                    }
                  }] : [])
                ]}
              />
            )}

          </div>

          {/* Delete Trigger - moved outside the clickable area */}
          {onDelete && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
              }}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-neutral-100 backdrop-blur hover:bg-neutral-900 text-neutral-400 hover:text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-all duration-300 z-30 hover:scale-110 border border-neutral-200"
              title="Remove from Musee"
            >
              <span className="text-xs">✕</span>
            </button>
          )}

          {/* AI Insight Metadata - constrained to image width */}
          {imageWidth > 0 && (
            <div
              className="mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{ width: imageWidth }}
            >
              <div className="text-center mb-3">
                <span className="text-[7px] tracking-[0.3em] uppercase font-bold text-neutral-300">
                  1 Piece
                </span>
              </div>

              <div className="flex flex-wrap justify-center gap-x-2 gap-y-0.5">
                {keywords.map((kw, idx) => (
                  <span
                    key={idx}
                    className="text-[8px] uppercase tracking-[0.15em] font-medium leading-tight"
                    style={{ color: vibe.accentColor }}
                  >
                    {kw}
                  </span>
                ))}
              </div>
              <div className="mt-4 mx-auto w-12 h-px opacity-20" style={{ backgroundColor: vibe.accentColor }}></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GalleryCard;
