
import React from 'react';
import { GalleryItem, Visit, Album } from '../types';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

const OverflowDotsIcon: React.FC<{ className?: string }> = ({ className = 'h-3.5 w-3.5' }) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
    <circle cx="3" cy="8" r="1.25" />
    <circle cx="8" cy="8" r="1.25" />
    <circle cx="13" cy="8" r="1.25" />
  </svg>
);

interface Props {
  items: GalleryItem[];
  visit: Visit;
  filteredVisitId: string | null;
  isAnalyzing: boolean;
  boards?: Album[];
  onInterpret: (item: GalleryItem, contextItems?: GalleryItem[]) => void;
  onDelete: (id: string) => void;
  onRequestCreateBoard: (options?: { itemIds?: string[]; onCreated?: (board: Album) => void }) => void;
  onAddToBoard: (boardId: string, itemIds: string[]) => Promise<void>;
}

const GridView: React.FC<Props> = ({
  items,
  visit,
  filteredVisitId,
  isAnalyzing,
  boards = [],
  onInterpret,
  onDelete,
  onRequestCreateBoard,
  onAddToBoard,
}) => {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [isApplyingBoard, setIsApplyingBoard] = React.useState(false);
  const displayItems = items;
  const isSelectionMode = selectedIds.length > 0;

  const toggleSelection = React.useCallback((itemId: string) => {
    setSelectedIds(prev => (
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    ));
  }, []);

  const clearSelection = React.useCallback(() => {
    setSelectedIds([]);
  }, []);

  const handleAddSelectionToBoard = async (boardId: string) => {
    if (!boardId || selectedIds.length === 0) return;
    try {
      setIsApplyingBoard(true);
      await onAddToBoard(boardId, selectedIds);
      clearSelection();
    } finally {
      setIsApplyingBoard(false);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div className="h-full overflow-y-auto px-4 sm:px-10 pt-6 pb-32">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-4">
          {displayItems.map(item => (
            <div
              key={item.id}
              className="group relative aspect-square cursor-pointer rounded bg-neutral-100"
              onClick={() => {
                if (isSelectionMode) {
                  toggleSelection(item.id);
                  return;
                }
                onInterpret(item, displayItems);
              }}
            >
              <div className="absolute inset-0 overflow-hidden rounded">
              {/* Spinner sits behind the img; visible when img hides on error or while analyzing */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-neutral-200 border-t-neutral-400 rounded-full animate-spin" />
              </div>
              <img
                src={item.url}
                alt={item.artworkName || ''}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                className={`relative w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${item.isAnalyzing ? 'blur-sm opacity-50' : ''} ${selectedIds.includes(item.id) ? 'ring-2 ring-offset-[-2px] ring-neutral-900' : ''}`}
              />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-1.5">
                {item.artworkName && (
                  <p className="text-white text-[12px] font-medium leading-tight truncate">{item.artworkName}</p>
                )}
                {item.artistName && (
                  <p className="text-white/70 text-[10px] truncate">{item.artistName}</p>
                )}
              </div>
              </div>
              <Checkbox
                checked={selectedIds.includes(item.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleSelection(item.id);
                }}
                className={`absolute top-2 left-2 z-20 ${!selectedIds.includes(item.id) && !isSelectionMode ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}
                aria-label={selectedIds.includes(item.id) ? 'Deselect artwork' : 'Select artwork'}
              />
              {!isSelectionMode && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="absolute top-2 right-2 z-30 flex h-7 w-7 items-center justify-center rounded-md border border-white/80 bg-black/35 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Artwork actions"
                    >
                      <OverflowDotsIcon />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[180px]">
                    <DropdownMenuItem
                      destructive
                      onSelect={(event) => {
                        event.preventDefault();
                        onDelete(item.id);
                      }}
                    >
                      Delete artwork
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </div>
        {displayItems.length === 0 && !isAnalyzing && (
          <div className="flex items-center justify-center h-64">
            <p className="text-[12px] text-neutral-300">No artworks yet</p>
          </div>
        )}
      </div>
      {isSelectionMode && (
        <div className="absolute bottom-4 left-4 z-40 sm:left-10">
          <div className="inline-flex w-fit items-center gap-4 whitespace-nowrap rounded-[78px] border border-neutral-200 bg-white px-6 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
            <div className="whitespace-nowrap text-[13px] font-semibold text-neutral-900">
              {selectedIds.length} selected
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  className="min-w-[160px] justify-between gap-3"
                  disabled={isApplyingBoard}
                >
                  <span>{isApplyingBoard ? 'Saving…' : 'Add to board'}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[180px]">
                {boards.map(board => (
                  <DropdownMenuItem
                    key={board.id}
                    onSelect={(event) => {
                      event.preventDefault();
                      handleAddSelectionToBoard(board.id);
                    }}
                  >
                    {board.name}
                  </DropdownMenuItem>
                ))}
                {boards.length > 0 && <div className="my-1 h-px bg-neutral-100" />}
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    onRequestCreateBoard({
                      itemIds: selectedIds,
                      onCreated: () => clearSelection(),
                    });
                  }}
                >
                  <span className="mr-2 text-[14px] leading-none">+</span>
                  <span>New board</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              onClick={clearSelection}
              variant="ghost"
              className="px-0 font-medium"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GridView;
