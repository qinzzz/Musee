
import React from 'react';

const EmptyWall: React.FC = () => {
  return (
    <div className="w-screen h-full flex flex-col items-center justify-center bg-[#fdfdfd] shrink-0">
      {/* Light Column */}
      <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-neutral-200 to-transparent opacity-50" />
      
      <div className="relative z-10 flex flex-col items-center max-w-md text-center px-12 animate-in fade-in zoom-in-95 duration-1000">
        <div className="mb-12">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-10">
            <rect x="0.5" y="0.5" width="39" height="39" stroke="black" strokeDasharray="4 4"/>
            <path d="M20 10V30" stroke="black" strokeWidth="0.5"/>
            <path d="M10 20H30" stroke="black" strokeWidth="0.5"/>
          </svg>
        </div>
        
        <h2 className="text-[10px] tracking-[0.7em] uppercase text-neutral-300 font-light mb-4">
          The First Presence
        </h2>
        
        <p className="text-[13px] text-neutral-400 font-serif italic leading-relaxed opacity-40">
          "A wall waits to be defined by the light of your perspective."
        </p>
        
        <div className="mt-20 flex flex-col items-center">
          <div className="w-8 h-px bg-neutral-100 mb-6" />
          <p className="text-[8px] tracking-[0.4em] uppercase text-neutral-300">
            Establish your resonance below
          </p>
        </div>
      </div>

      {/* Subtle depth indicators */}
      <div className="absolute inset-y-0 left-0 w-px bg-neutral-100 opacity-20" />
      <div className="absolute inset-y-0 right-0 w-px bg-neutral-100 opacity-20" />
    </div>
  );
};

export default EmptyWall;
