import type React from 'react';

import type { Board } from '../../boards/types';
import type { ArtworkWorkspace, GalleryItem } from '../../types';
import type { ActiveFilter, SavedFilterOption, SavedLayout } from '../types';
import CollectionGridSkeleton from '../../components/CollectionGridSkeleton';
import GridView from '../../components/GridView';
import { Button } from '../../components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../components/ui/dropdown-menu';

type Props = {
  showFilterBar: boolean;
  savedFilters: SavedFilterOption[];
  activeFilter: ActiveFilter;
  onActiveFilterChange: (filter: ActiveFilter) => void;
  unsortedCount: number;
  onStartUnsortedFlow: () => void;
  savedLayout: SavedLayout;
  onSavedLayoutChange: (layout: SavedLayout) => void;
  showSavedLoadingSkeleton: boolean;
  searchedSavedItems: GalleryItem[];
  artworkWorkspace: ArtworkWorkspace;
  filteredSessionId: string | null;
  isAnalyzing: boolean;
  boards: Board[];
  selectedArtworkIds: string[];
  isArtworkSelectionMode: boolean;
  onToggleSelection: (itemId: string) => void;
  onInterpret: (item: GalleryItem, context: { items: GalleryItem[]; label: string }) => void;
  onDelete: (id: string) => void;
  savedContextLabel: string;
  groupedItems: Array<{ label: string; items: GalleryItem[] }>;
  artworksLoaded: boolean;
  showSavedEmptyOverlay: boolean;
  normalizedCollectionSearch: string;
  onClearArtworkSelection: () => void;
  isApplyingBoard: boolean;
  isDeletingSelection: boolean;
  onAddSelectionToBoard: (boardId: string) => Promise<void>;
  onDeleteSelection: () => Promise<void>;
  onOpenCreateBoardModal: (options?: { itemIds?: string[]; onCreated?: (board: Board) => void }) => void;
};

export default function SavedArtworksSection({
  showFilterBar,
  savedFilters,
  activeFilter,
  onActiveFilterChange,
  unsortedCount,
  onStartUnsortedFlow,
  savedLayout,
  onSavedLayoutChange,
  showSavedLoadingSkeleton,
  searchedSavedItems,
  artworkWorkspace,
  filteredSessionId,
  isAnalyzing,
  boards,
  selectedArtworkIds,
  isArtworkSelectionMode,
  onToggleSelection,
  onInterpret,
  onDelete,
  savedContextLabel,
  groupedItems,
  artworksLoaded,
  showSavedEmptyOverlay,
  normalizedCollectionSearch,
  onClearArtworkSelection,
  isApplyingBoard,
  isDeletingSelection,
  onAddSelectionToBoard,
  onDeleteSelection,
  onOpenCreateBoardModal,
}: Props) {
  return (
    <div className="flex flex-col">
      <div className="sticky top-[52px] z-[70] flex items-center justify-between gap-3 bg-[var(--color-bg-primary)] px-4 pt-3 pb-2 sm:px-8 md:px-0">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto no-scrollbar">
          {showFilterBar && (
            <>
              {savedFilters.filter((filter) => filter.id === 'all' || (filter.count ?? 0) > 0).map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => onActiveFilterChange(filter.id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-all ${
                    activeFilter === filter.id
                      ? 'border-neutral-300 bg-neutral-100 text-neutral-900'
                      : 'border-neutral-200 text-neutral-500 hover:border-neutral-400'
                  }`}
                >
                  {filter.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[8px] tracking-normal ${
                      activeFilter === filter.id ? 'bg-white text-neutral-700' : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {filter.count}
                  </span>
                </button>
              ))}
            </>
          )}
          {unsortedCount > 0 && (
            <button
              onClick={onStartUnsortedFlow}
              className="shrink-0 rounded-full border border-neutral-200 px-3 py-1 text-[11px] font-medium text-neutral-700 transition-colors hover:border-neutral-400"
            >
              Sort Unsorted Works
            </button>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-0.5 rounded-full bg-neutral-100 p-0.5">
          <button
            onClick={() => onSavedLayoutChange('grid')}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-all ${
              savedLayout === 'grid' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-700'
            }`}
            title="Grid"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <circle cx="4.5" cy="4.5" r="2.5" />
              <circle cx="12" cy="4.5" r="2.5" />
              <circle cx="19.5" cy="4.5" r="2.5" />
              <circle cx="4.5" cy="12" r="2.5" />
              <circle cx="12" cy="12" r="2.5" />
              <circle cx="19.5" cy="12" r="2.5" />
              <circle cx="4.5" cy="19.5" r="2.5" />
              <circle cx="12" cy="19.5" r="2.5" />
              <circle cx="19.5" cy="19.5" r="2.5" />
            </svg>
          </button>
          <button
            onClick={() => onSavedLayoutChange('grouped')}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-all ${
              savedLayout === 'grouped' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-400 hover:text-neutral-700'
            }`}
            title="Grouped"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="relative">
        {showSavedLoadingSkeleton ? (
          <div className="px-4 pt-4 pb-32 sm:px-8 md:px-0">
            <CollectionGridSkeleton />
          </div>
        ) : savedLayout === 'grid' ? (
          <GridView
            items={searchedSavedItems}
            artworkWorkspace={artworkWorkspace}
            filteredSessionId={filteredSessionId}
            isAnalyzing={isAnalyzing}
            boards={boards}
            selectedIds={selectedArtworkIds}
            isSelectionMode={isArtworkSelectionMode}
            hasSelectionOverlay={selectedArtworkIds.length > 0}
            onToggleSelection={onToggleSelection}
            onInterpret={(item, contextItems) => onInterpret(item, { items: contextItems || searchedSavedItems, label: savedContextLabel })}
            onDelete={onDelete}
          />
        ) : (
          <div>
            {groupedItems.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-[12px] text-neutral-300">No artworks yet</p>
              </div>
            ) : (
              <div className="space-y-8 px-4 pt-4 pb-32 sm:px-8 md:px-0">
                {groupedItems.map((group) => (
                  <div key={group.label}>
                    <p className="mb-3 text-[11px] font-medium text-neutral-400">{group.label}</p>
                    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 sm:gap-2 md:grid-cols-8">
                      {group.items.map((item) => (
                        <div
                          key={item.id}
                          className={`group relative aspect-square overflow-hidden rounded bg-neutral-100 transition-opacity ${
                            item.deleteStatus === 'pending' ? 'cursor-default opacity-45' : 'cursor-pointer hover:opacity-90'
                          }`}
                          onClick={() => {
                            if (item.deleteStatus === 'pending') return;
                            onInterpret(item, { items: group.items, label: group.label });
                          }}
                        >
                          <img
                            src={item.thumbnailUrl || item.url}
                            alt=""
                            className={`h-full w-full object-cover ${item.deleteStatus === 'pending' ? 'saturate-[0.7]' : ''}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {artworksLoaded && showSavedEmptyOverlay && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-[12px] text-neutral-300">
              {normalizedCollectionSearch
                ? 'No matching artworks'
                : activeFilter === 'love'
                  ? 'No loved works yet'
                  : activeFilter === 'respect'
                    ? 'No respected works yet'
                    : activeFilter === 'not_for_me'
                      ? 'No works marked not for me'
                      : activeFilter === 'unsorted'
                        ? 'No unsorted works'
                        : 'No artworks yet'}
            </p>
          </div>
        )}

        {savedLayout === 'grid' && selectedArtworkIds.length > 0 && (
          <div className="pointer-events-none sticky bottom-5 z-[69] flex min-h-[72px] items-end justify-center px-5 md:justify-start md:px-0">
            <div className="pointer-events-auto inline-flex w-[calc(100vw-40px)] max-w-full items-center gap-3 rounded-[78px] border border-neutral-200 bg-white px-5 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)] md:w-auto md:gap-4 md:px-6">
              <div className="min-w-0 flex-1 whitespace-nowrap text-[13px] font-semibold text-neutral-900 md:flex-none">
                {selectedArtworkIds.length} selected
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" className="shrink-0 px-4" disabled={isApplyingBoard || isDeletingSelection}>
                    <span>{isApplyingBoard ? 'Saving…' : '+ Add to board'}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[180px]">
                  {boards.map((board) => (
                    <DropdownMenuItem
                      key={board.id}
                      onSelect={(event) => {
                        event.preventDefault();
                        void onAddSelectionToBoard(board.id);
                      }}
                    >
                      {board.name}
                    </DropdownMenuItem>
                  ))}
                  {boards.length > 0 && <div className="my-1 h-px bg-neutral-100" />}
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      onOpenCreateBoardModal({
                        itemIds: selectedArtworkIds,
                        onCreated: () => onClearArtworkSelection(),
                      });
                    }}
                  >
                    <span className="mr-2 text-[14px] leading-none">+</span>
                    <span>New board</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                onClick={() => void onDeleteSelection()}
                variant="secondary"
                className="h-10 w-10 shrink-0 rounded-full p-0 text-neutral-900"
                disabled={isApplyingBoard || isDeletingSelection}
                aria-label={isDeletingSelection ? 'Deleting selected artworks' : 'Delete selected artworks'}
                title={isDeletingSelection ? 'Deleting…' : 'Delete'}
              >
                <svg className="h-[17px] w-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M6.5 6l1 14h9l1-14" />
                  <path d="M10 11v5" />
                  <path d="M14 11v5" />
                </svg>
              </Button>
              <Button
                onClick={onClearArtworkSelection}
                variant="ghost"
                className="h-10 w-10 shrink-0 rounded-full p-0 text-neutral-900"
                disabled={isApplyingBoard || isDeletingSelection}
                aria-label="Clear selected artworks"
                title="Clear"
              >
                <svg className="h-[17px] w-[17px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="#111111" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12" />
                  <path d="M18 6L6 18" />
                </svg>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
