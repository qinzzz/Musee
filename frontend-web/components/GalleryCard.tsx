
import React from 'react';
import { GalleryItem } from '../types';

interface Props {
  item: GalleryItem;
  onInterpret: () => void;
  onDelete?: () => void;
}

const GalleryCard: React.FC<Props> = ({ item, onInterpret, onDelete }) => {
  const { vibe, url, keywords } = item;
  const [imageWidth, setImageWidth] = React.useState<number>(0);
  const imageRef = React.useRef<HTMLImageElement>(null);

  const handleImageLoad = () => {
    if (imageRef.current) {
      setImageWidth(imageRef.current.offsetWidth);
    }
  };

  return (
    <div
      className="min-w-[40vw] h-[80vh] mx-12 flex items-center justify-center transition-all duration-1000 group"
      style={{ backgroundColor: 'transparent' }}
    >
      <div className="flex flex-col items-center max-w-full">
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
              className="max-h-[60vh] max-w-full w-auto block transition-transform duration-700 group-hover:scale-105 object-contain"
            />

            {/* Interpretation Trigger Overlay */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onInterpret();
              }}
              className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity duration-500"
            >
              <div className="bg-white/90 backdrop-blur px-6 py-2 rounded-full text-[10px] tracking-[0.4em] uppercase font-bold text-neutral-900 shadow-xl hover:scale-105 transition-transform">
                Consult Curator
              </div>
            </button>

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
