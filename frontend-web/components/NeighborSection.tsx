
import React, { useState, useRef, useEffect } from 'react';
import { NeighborItem, NeighborWork } from '../types';
import { generateSpeech } from '../geminiService';

interface Props {
  neighbors: NeighborItem[];
  onInterpret: (work: NeighborWork) => void;
}

const NeighborSection: React.FC<Props> = ({ neighbors, onInterpret }) => {
  return (
    <div className="flex items-center space-x-32 px-24">
      {/* Narrative Intro */}
      <div className="flex flex-col max-w-[220px] shrink-0">
        <h4 className="text-[10px] tracking-[0.5em] uppercase text-neutral-500 mb-6 font-bold">Neighbor's Light</h4>
        <p className="text-[12px] text-neutral-500 font-light leading-relaxed tracking-widest uppercase">
          Towers of communal aesthetic. Scroll vertically to explore the depth of a specific resonance.
        </p>
      </div>

      {/* Aesthetic Towers */}
      <div className="flex items-start space-x-20">
        {neighbors.map((neighbor) => (
          <AestheticTower 
            key={neighbor.id} 
            neighbor={neighbor} 
            onInterpret={onInterpret} 
          />
        ))}
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
  const [playingThoughtId, setPlayingThoughtId] = useState<string | null>(null);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, clientHeight } = scrollRef.current;
    const newIndex = Math.round(scrollTop / clientHeight);
    if (newIndex !== activeIndex) {
      setActiveIndex(newIndex);
    }
  };

  const listenToThought = async (text: string, annotationId: string) => {
    setPlayingThoughtId(annotationId);
    await generateSpeech(text);
    setPlayingThoughtId(null);
  };

  return (
    <div className="relative w-[320px] h-screen flex flex-col items-center">
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
        className="w-full h-full overflow-y-auto overflow-x-hidden snap-y snap-mandatory no-scrollbar scroll-smooth py-[35vh]"
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

                  {/* Hotspots - only visible when focused */}
                  {isFocused && work.annotations.map(an => (
                    <div 
                      key={an.id}
                      className="absolute group/hot -translate-x-1/2 -translate-y-1/2 z-10"
                      style={{ left: `${an.x}%`, top: `${an.y}%` }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          listenToThought(an.comment, an.id);
                        }}
                        className={`w-6 h-6 rounded-full border border-amber-400 bg-amber-400/30 backdrop-blur shadow-[0_0_20px_rgba(251,191,36,0.6)] hover:scale-125 transition-all duration-500 ${playingThoughtId === an.id ? 'animate-ping' : 'animate-pulse'}`}
                      />
                    </div>
                  ))}

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