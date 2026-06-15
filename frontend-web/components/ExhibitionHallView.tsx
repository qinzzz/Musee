import React, { useState, useRef, useMemo, useEffect } from 'react';
import { GalleryItem, Message, Visit } from '../types';
import GalleryCard from './GalleryCard';

interface Props {
  items: GalleryItem[];
  visit: Visit;
  onClose: () => void;
  onInterpret: (item: GalleryItem) => void;
  onContinueVisit?: () => void;
  onDeleteItem: (id: string) => void;
}

const ExhibitionHallView: React.FC<Props> = ({ 
  items, 
  visit, 
  onClose, 
  onInterpret, 
  onContinueVisit,
  onDeleteItem
}) => {
  const [activeThumbIndex, setActiveThumbIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const thumbStripRef = useRef<HTMLDivElement>(null);
  const galleryEntryRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateActiveIndex = () => {
    const container = scrollRef.current;
    if (!container) return;
    const containerCenter = container.scrollLeft + container.offsetWidth / 2;
    let closest = 0;
    let closestDist = Infinity;
    galleryEntryRefs.current.forEach((el, idx) => {
      if (!el) return;
      const elCenter = el.offsetLeft + el.offsetWidth / 2;
      const dist = Math.abs(elCenter - containerCenter);
      if (dist < closestDist) { closestDist = dist; closest = idx; }
    });
    setActiveThumbIndex(closest);
  };

  // Only update active index once scrolling settles at a snap point, not mid-swipe
  const handleScroll = () => {
    if (scrollDebounceRef.current) clearTimeout(scrollDebounceRef.current);
    scrollDebounceRef.current = setTimeout(updateActiveIndex, 80);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // scrollend fires after snap settles on modern browsers (Safari 17.4+, Chrome 114+)
    el.addEventListener('scrollend', updateActiveIndex);
    return () => el.removeEventListener('scrollend', updateActiveIndex);
  }, [items]);

  useEffect(() => {
    updateActiveIndex();
  }, [items]);

  // Sync thumbnail scroll
  useEffect(() => {
    if (thumbStripRef.current) {
      const activeThumb = thumbStripRef.current.children[activeThumbIndex] as HTMLElement;
      if (activeThumb) {
        activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [activeThumbIndex]);

  const activeItem = items[activeThumbIndex];

  return (
    <div className="fixed inset-0 z-[var(--z-overlay)] bg-neutral-950 flex flex-col animate-in fade-in duration-700">
      {/* 1. Top Header with Search & Back */}
      <div className="shrink-0 h-24 flex items-center justify-between px-6 sm:px-12 relative z-20">
        <button 
          onClick={onClose}
          className="flex items-center space-x-2 text-neutral-400 hover:text-white transition-colors group"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-1 transition-transform">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          <span className="text-[10px] tracking-[0.2em] uppercase font-bold">Back</span>
        </button>

        <div className="w-16" />
      </div>

      {/* 2. Metadata Context */}
      <div className="shrink-0 text-center py-2 animate-in slide-in-from-top-4 duration-1000">
        <p className="text-[9px] tracking-[0.4em] uppercase text-neutral-500 font-bold mb-1">
          {visit.title || "UNNAMED EXHIBITION"}
        </p>
        <p className="text-[8px] tracking-[0.2em] uppercase text-neutral-600">
          {items.length} Works • {visit.updatedAt ? new Date(visit.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : "--"}
        </p>
      </div>

      {/* 3. The Main Cinematic Stage */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 flex items-center overflow-x-auto snap-x snap-mandatory horizontal-corridor no-scrollbar overflow-y-visible"
      >
        <div className="min-w-[40vw] sm:min-w-[45vw] h-full shrink-0" />
        {items.map((item, idx) => (
          <div
            key={item.id}
            className="snap-center shrink-0 h-full flex items-center mx-12 sm:mx-24"
            ref={(el) => { galleryEntryRefs.current[idx] = el; }}
          >
            <div 
              className={`relative transition-all duration-1000 ease-out transform ${
                idx === activeThumbIndex ? 'scale-100 opacity-100' : 'scale-90 opacity-40 blur-sm'
              }`}
            >
              <GalleryCard 
                item={item}
                isActive={idx === activeThumbIndex}
                onInterpret={() => onInterpret(item)}
                onDelete={() => onDeleteItem(item.id)}
                size="large" // New prop hint
              />
            </div>
          </div>
        ))}
        <div className="min-w-[40vw] sm:min-w-[45vw] h-full shrink-0" />
      </div>

      {/* 4. Bottom Navbar (Thumbnails & Labels) */}
      <div className="shrink-0 pb-12 pt-4 px-6 sm:px-12 flex flex-col items-center space-y-6">
        {/* Active Item Metadata */}
        <div className="h-6 overflow-hidden text-center">
          <p className="text-[10px] tracking-[0.2em] uppercase text-neutral-300 font-medium animate-in slide-in-from-bottom-2 duration-500">
            {activeItem?.artworkName || "UNRESOLVED WORK"} <span className="text-neutral-600 mx-2">|</span> {activeItem?.artistName || "UNKNOWN"}
          </p>
        </div>

        {/* Thumbnail Strip */}
        <div className="flex items-center gap-4">
          <span className="text-[9px] tracking-[0.15em] text-neutral-600 tabular-nums shrink-0 font-bold">
            {String(activeThumbIndex + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}
          </span>
          <div
            ref={thumbStripRef}
            className="flex items-center gap-3 overflow-x-auto no-scrollbar py-2"
          >
            {items.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => {
                  galleryEntryRefs.current[idx]?.scrollIntoView({
                    behavior: 'smooth', block: 'nearest', inline: 'center'
                  });
                }}
                className={`overflow-hidden shrink-0 transition-all duration-500 rounded-sm bg-neutral-900 flex items-center justify-center ${
                  idx === activeThumbIndex
                    ? 'w-10 h-10 opacity-100 ring-1 ring-white ring-offset-4 ring-offset-neutral-950'
                    : 'w-7 h-7 opacity-30 hover:opacity-60'
                }`}
              >
                <img src={item.url} alt="" className="w-full h-full object-contain" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExhibitionHallView;
