import React from 'react';

interface Props {
  parentLabel: string;
  parentClick?: () => void;
  childLabel: string;
  isInline?: boolean;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  leftSlot?: React.ReactNode;
  onChildClick?: () => void;
  childExpanded?: boolean;
}

export default function CanvasHeader({
  parentLabel,
  parentClick,
  childLabel,
  isInline,
  subtitle,
  rightSlot,
  leftSlot,
  onChildClick,
  childExpanded = false,
}: Props) {
  const titleContent = (
    <div className="inline-flex min-w-0 items-center rounded-[14px] px-2 py-1 transition-colors group-hover:bg-neutral-100/80 group-active:bg-neutral-200/70">
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="flex min-w-0 items-center gap-2 text-[13px] sm:text-[14px] font-medium tracking-wide">
          {parentLabel && (
            <>
              <span className="text-neutral-400 whitespace-nowrap">{parentLabel}</span>
              <span className="text-neutral-300 font-normal">/</span>
            </>
          )}
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-neutral-800 font-semibold truncate">
              {childLabel}
            </span>
            {onChildClick ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-colors group-hover:bg-neutral-100 group-hover:text-neutral-700 group-active:bg-neutral-200/80">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-transform ${childExpanded ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            ) : null}
          </div>
        </div>
        {subtitle && (
          <p className="text-[12px] text-neutral-500 font-normal truncate mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={`flex min-h-[52px] items-center gap-2.5 border-b border-neutral-200/80 bg-[var(--color-bg-primary)] shrink-0 z-10 sticky top-0 ${
        isInline ? 'px-5 sm:px-8' : 'px-4'
      }`}
      style={{ fontFamily: 'system-ui, sans-serif' }}
    >
      {leftSlot && (
        <div className="shrink-0">
          {leftSlot}
        </div>
      )}
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

      {onChildClick ? (
        <button
          type="button"
          onClick={onChildClick}
          className="group -ml-2 flex min-w-0 flex-1 items-center text-left"
          aria-expanded={childExpanded}
        >
          {titleContent}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center">
          {titleContent}
        </div>
      )}
      {rightSlot && (
        <div className="ml-auto flex shrink-0 items-center">
          {rightSlot}
        </div>
      )}
    </div>
  );
}
