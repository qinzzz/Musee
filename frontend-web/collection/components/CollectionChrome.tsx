import type React from 'react';

import type { CollectTab } from '../../lib/appNavigation';

const TABS: { id: CollectTab; label: string }[] = [
  { id: 'saved', label: 'All Artworks' },
  { id: 'boards', label: 'Boards' },
  { id: 'artists', label: 'Artists' },
];

type Props = {
  topBarLeftSlot?: React.ReactNode;
  collectTab: CollectTab;
  collectionSearch: string;
  collectionSearchPlaceholder: string;
  showCollectionUpload?: boolean;
  showArtworkSelection: boolean;
  isArtworkSelectionMode: boolean;
  onCollectTabChange: (tab: CollectTab) => void;
  onCollectionSearchChange: (value: string) => void;
  onOpenUpload: () => void;
  onEnterArtworkSelectionMode: () => void;
  onExitArtworkSelectionMode: () => void;
};

export default function CollectionChrome({
  topBarLeftSlot,
  collectTab,
  collectionSearch,
  collectionSearchPlaceholder,
  showCollectionUpload = true,
  showArtworkSelection,
  isArtworkSelectionMode,
  onCollectTabChange,
  onCollectionSearchChange,
  onOpenUpload,
  onEnterArtworkSelectionMode,
  onExitArtworkSelectionMode,
}: Props) {
  return (
    <>
      <div className="sticky top-0 z-[90] flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-neutral-100 bg-[var(--color-bg-primary)] px-4 md:hidden">
        <div className="flex min-w-0 items-center gap-3">
          {topBarLeftSlot ? <div className="shrink-0">{topBarLeftSlot}</div> : null}
          <span className="truncate text-[15px] font-semibold text-neutral-900">Collection</span>
        </div>
        {showCollectionUpload ? (
          <button
            onClick={onOpenUpload}
            className="shrink-0 rounded-full border border-neutral-200 bg-white px-4 py-2 text-[12px] font-medium text-neutral-700 transition-colors hover:border-neutral-400 hover:bg-neutral-50"
          >
            Upload
          </button>
        ) : null}
      </div>

      <div className="sticky top-[52px] z-[80] flex h-[52px] items-center gap-6 overflow-x-auto bg-[var(--color-bg-primary)] px-4 no-scrollbar sm:px-8 md:top-0 md:px-0">
        <div className="flex min-w-0 items-center gap-6 overflow-x-auto no-scrollbar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onCollectTabChange(tab.id)}
              className={`-mb-px h-full shrink-0 whitespace-nowrap border-b-2 text-[13px] font-medium transition-all sm:text-[14px] ${
                collectTab === tab.id
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-400 hover:text-neutral-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {showArtworkSelection && (
          <button
            type="button"
            onClick={isArtworkSelectionMode ? onExitArtworkSelectionMode : onEnterArtworkSelectionMode}
            className="ml-auto flex h-11 shrink-0 items-center justify-center px-1 text-[14px] font-medium text-neutral-700 [@media(min-width:768px)_and_(hover:hover)_and_(pointer:fine)]:hidden"
            aria-pressed={isArtworkSelectionMode}
          >
            {isArtworkSelectionMode ? 'Done' : 'Select'}
          </button>
        )}
        <div className="ml-auto hidden min-w-0 items-center gap-3 md:flex">
          <div className="flex w-[240px] items-center gap-2.5 rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-neutral-700">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-neutral-400">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={collectionSearch}
              onChange={(event) => onCollectionSearchChange(event.target.value)}
              placeholder={collectionSearchPlaceholder}
              className="w-full bg-transparent text-[12px] font-medium text-neutral-700 placeholder-neutral-400 outline-none"
            />
          </div>
          {showCollectionUpload && (
            <button
              onClick={onOpenUpload}
              className="shrink-0 rounded-full border border-neutral-200 bg-white px-4 py-2 text-[12px] font-medium text-neutral-700 transition-colors hover:border-neutral-400 hover:bg-neutral-50"
            >
              Upload
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pt-3 md:hidden">
        <div className="flex w-full items-center gap-2.5 rounded-full border border-neutral-200 bg-white px-3.5 py-2 text-neutral-700">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-neutral-400">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={collectionSearch}
            onChange={(event) => onCollectionSearchChange(event.target.value)}
            placeholder={collectionSearchPlaceholder}
            className="w-full bg-transparent text-[16px] font-medium text-neutral-700 placeholder-neutral-400 outline-none"
          />
        </div>
      </div>
    </>
  );
}
