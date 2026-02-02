
import React from 'react';
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

  return (
    <div
      className="min-w-[40vw] h-[80vh] mx-12 flex items-center justify-center transition-all duration-1000 group"
      style={{ backgroundColor: 'transparent' }}
    >
      <div className="flex flex-col items-center max-w-full">
        {/* Location and Date Metadata */}
        {(item.location || item.photoTime) && (
          <div className="mb-6 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-700 transform translate-y-4 group-hover:translate-y-0">
            {displayLocation && (
              <h3 className="text-lg font-serif text-neutral-800 mb-2 whitespace-nowrap">
                {displayLocation}
              </h3>
            )}
            {item.photoTime && (
              <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 font-light">
                {item.photoTime}
              </p>
            )}
          </div>
        )}

        {/* Card frame - hugs the image */}
        <div
          className="relative transition-all duration-700 shadow-2xl max-w-[90vw] sm:max-w-[85vw]"
          style={{
            backgroundColor: vibe.backgroundColor,
            padding: `${vibe.padding * 12}px`,
            borderRadius: vibe.borderRadius,
            border: `1px solid ${vibe.accentColor}22`
          }}
        >
          <div className="relative overflow-hidden group/img" style={{ borderRadius: vibe.borderRadius }}>
            <img
              ref={imageRef}
              src={url}
              alt="Gallery item"
              onLoad={handleImageLoad}
              className={`max-h-[60vh] max-w-full w-auto block transition-all duration-700 object-contain ${item.isAnalyzing ? 'blur-md opacity-60 scale-95' : 'group-hover:scale-105'
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

            {!item.isAnalyzing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 opacity-0 group-hover/img:opacity-100 transition-opacity duration-500 bg-black/20">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onInterpret();
                  }}
                  className="bg-white/90 backdrop-blur px-6 py-2 rounded-full text-[10px] tracking-[0.4em] uppercase font-bold text-neutral-900 shadow-xl hover:scale-105 transition-transform"
                >
                  Consult Curator
                </button>
                {onContinueVision && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onContinueVision();
                    }}
                    className="bg-neutral-900/90 backdrop-blur px-6 py-2 rounded-full text-[10px] tracking-[0.4em] uppercase font-bold text-white shadow-xl hover:scale-105 transition-transform"
                  >
                    Continue the Visit
                  </button>
                )}
              </div>
            )}

            {/* Delete Trigger */}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 backdrop-blur hover:bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-all duration-300 z-10 hover:scale-110"
                title="Remove from Musee"
              >
                <span className="text-xs">✕</span>
              </button>
            )}
          </div>

          {/* AI Insight Metadata - constrained to image width */}
          {imageWidth > 0 && (
            <div
              className="mt-6 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{ width: imageWidth }}
            >
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-2">
                {keywords.map((kw, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] uppercase tracking-[0.2em] font-medium"
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
