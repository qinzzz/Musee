
import React, { useState, useRef, useEffect } from 'react';
import { NeighborItem, NeighborWork } from '../types';

interface Props {
  neighbors: NeighborItem[];
  onInterpret: (work: NeighborWork) => void;
}

const NeighborSection: React.FC<Props> = ({ neighbors, onInterpret }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (activeIndex > neighbors.length - 1) {
      setActiveIndex(Math.max(0, neighbors.length - 1));
    }
  }, [activeIndex, neighbors.length]);

  const handleTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0].clientX;
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 40) return;
    if (delta < 0) {
      setActiveIndex((prev) => Math.min(neighbors.length - 1, prev + 1));
    } else {
      setActiveIndex((prev) => Math.max(0, prev - 1));
    }
  };

  const activeNeighbor = neighbors[activeIndex];

  return (
    <div
      className="flex flex-col sm:flex-row sm:items-center items-start sm:space-x-24 space-x-0 space-y-10 sm:space-y-0 px-6 sm:px-20 w-full"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Narrative Intro + Tag Rail */}
      <div className="flex flex-col max-w-[240px] shrink-0">
        <h4 className="text-[10px] tracking-[0.5em] uppercase text-neutral-500 mb-6 font-bold">Community</h4>
        <p className="text-[12px] text-neutral-500 font-light leading-relaxed tracking-widest uppercase">
          Switch tags horizontally. Scroll vertically to explore depth within a resonance.
        </p>
        <div className="mt-6 flex items-center space-x-2">
          <button
            onClick={() => setActiveIndex((prev) => Math.max(0, prev - 1))}
            className="w-8 h-8 rounded-full border border-neutral-200 text-neutral-400 hover:text-neutral-700 hover:border-neutral-300 transition-colors"
            aria-label="Previous tag"
          >
            ‹
          </button>
          <div className="flex-1 overflow-x-auto no-scrollbar">
            <div className="flex items-center space-x-2 min-w-max">
              {neighbors.map((neighbor, idx) => (
                <button
                  key={neighbor.id}
                  onClick={() => setActiveIndex(idx)}
                  className={`px-3 py-1.5 rounded-full text-[10px] tracking-[0.3em] uppercase font-semibold transition-all ${
                    idx === activeIndex
                      ? 'bg-neutral-900 text-white shadow-lg'
                      : 'bg-neutral-100 text-neutral-400 hover:text-neutral-700'
                  }`}
                >
                  {neighbor.mainKeyword}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => setActiveIndex((prev) => Math.min(neighbors.length - 1, prev + 1))}
            className="w-8 h-8 rounded-full border border-neutral-200 text-neutral-400 hover:text-neutral-700 hover:border-neutral-300 transition-colors"
            aria-label="Next tag"
          >
            ›
          </button>
        </div>
        <div className="mt-3 flex items-center space-x-1.5">
          {neighbors.map((neighbor, idx) => (
            <span
              key={neighbor.id}
              className={`h-1.5 rounded-full transition-all ${
                idx === activeIndex ? 'w-6 bg-neutral-900' : 'w-2 bg-neutral-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Active Aesthetic Tower */}
      <div className="flex-1 flex justify-center w-full">
        {activeNeighbor && (
          <AestheticTower neighbor={activeNeighbor} onInterpret={onInterpret} />
        )}
      </div>
    </div>
  );
};

interface TowerProps {
  neighbor: NeighborItem;
  onInterpret: (work: NeighborWork) => void;
}

const AestheticTower: React.FC<TowerProps> = ({ neighbor, onInterpret }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, clientHeight } = scrollRef.current;
    const newIndex = Math.round(scrollTop / clientHeight);
    if (newIndex !== activeIndex) {
      setActiveIndex(newIndex);
    }
  };

  return (
    <div className="relative w-[260px] sm:w-[320px] h-[70vh] sm:h-screen flex flex-col items-center">
      {/* Tower Label */}
      <div className="absolute top-12 z-20 flex flex-col items-center pointer-events-none">
        <span className="text-[11px] tracking-[0.4em] uppercase text-neutral-400 font-medium bg-neutral-900/10 px-4 py-1 rounded-full backdrop-blur-sm">
          {neighbor.mainKeyword}
        </span>
      </div>

      {/* Vertical Column */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="w-full h-full overflow-y-auto overflow-x-hidden snap-y snap-mandatory no-scrollbar scroll-smooth py-[20vh] sm:py-[35vh]"
      >
        {neighbor.works.map((work, idx) => {
          const distance = Math.abs(idx - activeIndex);
          const isFocused = idx === activeIndex;
          
          return (
            <div 
              key={work.id}
              className="w-full h-[60vh] flex items-center justify-center snap-center transition-all duration-700 ease-out py-8"
              style={{
                opacity: Math.max(0.1, 1 - distance * 0.4),
                filter: `blur(${distance * 10}px) grayscale(${distance * 0.5})`,
                transform: `scale(${1 - distance * 0.1})`,
              }}
            >
              <div className="relative group w-64 h-96 flex-shrink-0">
                <div 
                  className={`relative w-full h-full overflow-hidden rounded-2xl border transition-all duration-700 ${isFocused ? 'shadow-2xl border-white/20' : 'border-transparent shadow-none'}`}
                  onClick={() => isFocused && onInterpret(work)}
                >
                  <img 
                    src={work.url} 
                    className="w-full h-full object-cover"
                    alt={`Resonance work ${idx}`}
                  />


                  {/* Focused Overlay */}
                  {isFocused && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end justify-center pb-8 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                      <button className="bg-white/95 text-neutral-900 px-6 py-2 rounded-full text-[9px] tracking-[0.4em] uppercase font-bold shadow-2xl hover:scale-105 transition-transform">
                        Investigate
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NeighborSection;
