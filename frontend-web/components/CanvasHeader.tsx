import React from 'react';

interface Props {
  parentLabel: string;
  parentClick?: () => void;
  childLabel: string;
  isInline?: boolean;
  subtitle?: string;
}

export default function CanvasHeader({ parentLabel, parentClick, childLabel, isInline, subtitle }: Props) {
  return (
    <div
      className={`flex items-center gap-2.5 pb-3.5 border-b border-neutral-200/80 bg-[#faf9f7]/95 backdrop-blur shrink-0 z-10 sticky top-0 ${
        isInline ? 'px-5 sm:px-8 pl-16 md:pl-8 pt-4' : 'px-4 pt-safe pt-4'
      }`}
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      {parentClick && (
        <button
          onClick={parentClick}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-200/50 transition-colors shrink-0 text-neutral-700"
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}
      
      <div className="flex flex-col min-w-0 justify-center">
        <div className="flex items-center gap-2 text-[13px] sm:text-[14px] min-w-0 font-medium tracking-wide">
          {parentLabel && (
            <>
              <span className="text-neutral-400 whitespace-nowrap">{parentLabel}</span>
              <span className="text-neutral-300 font-normal">/</span>
            </>
          )}
          <span className="text-neutral-800 font-semibold truncate">
            {childLabel}
          </span>
        </div>
        {subtitle && (
          <p className="text-[12px] text-neutral-500 font-normal truncate mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
